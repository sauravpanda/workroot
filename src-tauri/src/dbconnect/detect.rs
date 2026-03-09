use super::{DbConfig, DbType};
use crate::db::queries;
use crate::db::AppDb;
use crate::vault::crypto;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

/// Detect database connection from a worktree's environment variables.
pub fn detect_database(app: &AppHandle, worktree_id: i64) -> Result<Option<DbConfig>, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    // Get all env vars across profiles for this project
    let profiles =
        queries::list_env_profiles(&conn, worktree.project_id).map_err(|e| format!("DB: {}", e))?;

    for profile in &profiles {
        let vars = queries::list_env_vars_with_values(&conn, profile.id)
            .map_err(|e| format!("DB: {}", e))?;

        // Check for DATABASE_URL first (most common)
        for var in &vars {
            if var.key == "DATABASE_URL" || var.key == "DB_URL" {
                if let Some(ref encrypted) = var.encrypted_value {
                    if let Ok(decrypted) = crypto::decrypt(encrypted) {
                        if let Some(config) = parse_connection_string(&decrypted) {
                            return Ok(Some(config));
                        }
                    }
                }
            }
        }

        // Check for PostgreSQL-specific vars
        if let Some(config) = detect_postgres_vars(&conn, &vars) {
            return Ok(Some(config));
        }

        // Check for MySQL-specific vars
        if let Some(config) = detect_mysql_vars(&conn, &vars) {
            return Ok(Some(config));
        }
    }

    // Check for SQLite files in project directory
    if let Some(config) = detect_sqlite_file(&worktree.path) {
        return Ok(Some(config));
    }

    Ok(None)
}

/// Parse a DATABASE_URL into a DbConfig.
pub fn parse_connection_string(url: &str) -> Option<DbConfig> {
    let url = url.trim();

    if url.starts_with("postgres://") || url.starts_with("postgresql://") {
        return parse_postgres_url(url);
    }

    if url.starts_with("mysql://") || url.starts_with("mariadb://") {
        return parse_mysql_url(url);
    }

    if url.starts_with("sqlite://") || url.starts_with("sqlite:") {
        let path = url
            .strip_prefix("sqlite://")
            .or_else(|| url.strip_prefix("sqlite:"))?;
        return Some(DbConfig {
            db_type: DbType::Sqlite,
            url: url.to_string(),
            host: None,
            port: None,
            database: Some(path.to_string()),
            username: None,
        });
    }

    // Check if it looks like a file path to a SQLite database
    if url.ends_with(".db") || url.ends_with(".sqlite") || url.ends_with(".sqlite3") {
        return Some(DbConfig {
            db_type: DbType::Sqlite,
            url: format!("sqlite:{}", url),
            host: None,
            port: None,
            database: Some(url.to_string()),
            username: None,
        });
    }

    None
}

fn parse_postgres_url(url: &str) -> Option<DbConfig> {
    // Format: postgres://user:pass@host:port/dbname
    let after_scheme = url
        .strip_prefix("postgres://")
        .or_else(|| url.strip_prefix("postgresql://"))?;
    let (userinfo, rest) = split_at_char(after_scheme, '@');

    let username = if userinfo.contains(':') {
        Some(userinfo.split(':').next()?.to_string())
    } else if !userinfo.is_empty() && rest.is_some() {
        Some(userinfo.to_string())
    } else {
        None
    };

    let hostpart = rest.unwrap_or(userinfo);
    let (hostport, dbname) = split_at_char(hostpart, '/');

    let (host, port) = if hostport.contains(':') {
        let parts: Vec<&str> = hostport.splitn(2, ':').collect();
        (
            Some(parts[0].to_string()),
            parts.get(1).and_then(|p| p.parse().ok()),
        )
    } else {
        (Some(hostport.to_string()), Some(5432))
    };

    Some(DbConfig {
        db_type: DbType::Postgres,
        url: url.to_string(),
        host,
        port,
        database: dbname.map(|s| s.split('?').next().unwrap_or(s).to_string()),
        username,
    })
}

fn parse_mysql_url(url: &str) -> Option<DbConfig> {
    let after_scheme = url
        .strip_prefix("mysql://")
        .or_else(|| url.strip_prefix("mariadb://"))?;
    let (userinfo, rest) = split_at_char(after_scheme, '@');

    let username = if userinfo.contains(':') {
        Some(userinfo.split(':').next()?.to_string())
    } else if !userinfo.is_empty() && rest.is_some() {
        Some(userinfo.to_string())
    } else {
        None
    };

    let hostpart = rest.unwrap_or(userinfo);
    let (hostport, dbname) = split_at_char(hostpart, '/');

    let (host, port) = if hostport.contains(':') {
        let parts: Vec<&str> = hostport.splitn(2, ':').collect();
        (
            Some(parts[0].to_string()),
            parts.get(1).and_then(|p| p.parse().ok()),
        )
    } else {
        (Some(hostport.to_string()), Some(3306))
    };

    Some(DbConfig {
        db_type: DbType::Mysql,
        url: url.to_string(),
        host,
        port,
        database: dbname.map(|s| s.split('?').next().unwrap_or(s).to_string()),
        username,
    })
}

fn split_at_char(s: &str, ch: char) -> (&str, Option<&str>) {
    match s.find(ch) {
        Some(pos) => (&s[..pos], Some(&s[pos + 1..])),
        None => (s, None),
    }
}

fn detect_postgres_vars(_conn: &Connection, vars: &[queries::EnvVarFullRow]) -> Option<DbConfig> {
    let pghost = vars.iter().find(|v| v.key == "PGHOST");
    let pgdatabase = vars.iter().find(|v| v.key == "PGDATABASE");

    if pghost.is_none() && pgdatabase.is_none() {
        return None;
    }

    let host = pghost
        .and_then(|v| v.encrypted_value.as_ref())
        .and_then(|enc| crypto::decrypt(enc).ok());

    let database = pgdatabase
        .and_then(|v| v.encrypted_value.as_ref())
        .and_then(|enc| crypto::decrypt(enc).ok());

    let port = vars
        .iter()
        .find(|v| v.key == "PGPORT")
        .and_then(|v| v.encrypted_value.as_ref())
        .and_then(|enc| crypto::decrypt(enc).ok())
        .and_then(|p| p.parse().ok());

    let username = vars
        .iter()
        .find(|v| v.key == "PGUSER")
        .and_then(|v| v.encrypted_value.as_ref())
        .and_then(|enc| crypto::decrypt(enc).ok());

    Some(DbConfig {
        db_type: DbType::Postgres,
        url: format!(
            "postgres://{}:5432/{}",
            host.as_deref().unwrap_or("localhost"),
            database.as_deref().unwrap_or("")
        ),
        host,
        port: port.or(Some(5432)),
        database,
        username,
    })
}

fn detect_mysql_vars(_conn: &Connection, vars: &[queries::EnvVarFullRow]) -> Option<DbConfig> {
    let host_var = vars
        .iter()
        .find(|v| v.key == "MYSQL_HOST" || v.key == "DB_HOST");
    let db_var = vars
        .iter()
        .find(|v| v.key == "MYSQL_DATABASE" || v.key == "DB_NAME");

    if host_var.is_none() && db_var.is_none() {
        return None;
    }

    let host = host_var
        .and_then(|v| v.encrypted_value.as_ref())
        .and_then(|enc| crypto::decrypt(enc).ok());

    let database = db_var
        .and_then(|v| v.encrypted_value.as_ref())
        .and_then(|enc| crypto::decrypt(enc).ok());

    Some(DbConfig {
        db_type: DbType::Mysql,
        url: format!(
            "mysql://{}:3306/{}",
            host.as_deref().unwrap_or("localhost"),
            database.as_deref().unwrap_or("")
        ),
        host,
        port: Some(3306),
        database,
        username: None,
    })
}

fn detect_sqlite_file(project_path: &str) -> Option<DbConfig> {
    let path = std::path::Path::new(project_path);

    // Common SQLite file locations
    let candidates = [
        "db.sqlite3",
        "db.sqlite",
        "database.sqlite",
        "database.sqlite3",
        "dev.db",
        "development.sqlite3",
        "data.db",
    ];

    for name in &candidates {
        let db_path = path.join(name);
        if db_path.exists() {
            let abs = db_path.to_string_lossy().to_string();
            return Some(DbConfig {
                db_type: DbType::Sqlite,
                url: format!("sqlite:{}", abs),
                host: None,
                port: None,
                database: Some(abs),
                username: None,
            });
        }
    }

    None
}

/// Tauri command: detect database for a worktree.
#[tauri::command]
pub fn detect_worktree_database(
    app: tauri::AppHandle,
    worktree_id: i64,
) -> Result<Option<DbConfig>, String> {
    detect_database(&app, worktree_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_postgres_url() {
        let config = parse_connection_string("postgres://user:pass@localhost:5432/mydb").unwrap();
        assert_eq!(config.db_type, DbType::Postgres);
        assert_eq!(config.host.as_deref(), Some("localhost"));
        assert_eq!(config.port, Some(5432));
        assert_eq!(config.database.as_deref(), Some("mydb"));
        assert_eq!(config.username.as_deref(), Some("user"));
    }

    #[test]
    fn parse_postgres_url_with_params() {
        let config = parse_connection_string(
            "postgresql://admin@db.example.com:5433/production?sslmode=require",
        )
        .unwrap();
        assert_eq!(config.db_type, DbType::Postgres);
        assert_eq!(config.host.as_deref(), Some("db.example.com"));
        assert_eq!(config.port, Some(5433));
        assert_eq!(config.database.as_deref(), Some("production"));
    }

    #[test]
    fn parse_mysql_url() {
        let config = parse_connection_string("mysql://root:secret@db:3306/app").unwrap();
        assert_eq!(config.db_type, DbType::Mysql);
        assert_eq!(config.host.as_deref(), Some("db"));
        assert_eq!(config.port, Some(3306));
        assert_eq!(config.database.as_deref(), Some("app"));
    }

    #[test]
    fn parse_sqlite_url() {
        let config = parse_connection_string("sqlite:./data.db").unwrap();
        assert_eq!(config.db_type, DbType::Sqlite);
        assert_eq!(config.database.as_deref(), Some("./data.db"));
    }

    #[test]
    fn parse_sqlite_file_path() {
        let config = parse_connection_string("/tmp/app.sqlite3").unwrap();
        assert_eq!(config.db_type, DbType::Sqlite);
    }

    #[test]
    fn parse_unknown_returns_none() {
        assert!(parse_connection_string("redis://localhost:6379").is_none());
        assert!(parse_connection_string("random-string").is_none());
    }
}
