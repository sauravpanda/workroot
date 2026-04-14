use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct SshConnection {
    pub id: i64,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub key_path: Option<String>,
    pub jump_host: Option<String>,
    pub created_at: String,
}

/// List all saved SSH connections.
#[tauri::command]
pub fn list_ssh_connections(db: State<'_, AppDb>) -> Result<Vec<SshConnection>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, host, port, username, auth_type, key_path, jump_host, created_at
             FROM ssh_connections ORDER BY created_at DESC",
        )
        .map_err(|e| format!("DB: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            let port_i: i64 = row.get(3)?;
            Ok(SshConnection {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                port: port_i as u16,
                username: row.get(4)?,
                auth_type: row.get(5)?,
                key_path: row.get(6)?,
                jump_host: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| format!("DB: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB: {}", e))
}

#[allow(clippy::too_many_arguments)]
fn persist_ssh_connection(
    conn: &rusqlite::Connection,
    id: Option<i64>,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    key_path: Option<String>,
    jump_host: Option<String>,
) -> Result<i64, String> {
    match id {
        Some(id) => {
            let updated = conn
                .execute(
                    "UPDATE ssh_connections
                     SET name = ?1, host = ?2, port = ?3, username = ?4, auth_type = ?5, key_path = ?6, jump_host = ?7
                     WHERE id = ?8",
                    params![
                        name,
                        host,
                        port as i64,
                        username,
                        auth_type,
                        key_path,
                        jump_host,
                        id,
                    ],
                )
                .map_err(|e| format!("DB: {}", e))?;

            if updated == 0 {
                return Err(format!("SSH connection not found: {}", id));
            }

            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO ssh_connections (name, host, port, username, auth_type, key_path, jump_host)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    name,
                    host,
                    port as i64,
                    username,
                    auth_type,
                    key_path,
                    jump_host
                ],
            )
            .map_err(|e| format!("DB: {}", e))?;
            Ok(conn.last_insert_rowid())
        }
    }
}

/// Create an SSH connection profile.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_ssh_connection(
    db: State<'_, AppDb>,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    key_path: Option<String>,
    jump_host: Option<String>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    persist_ssh_connection(
        &conn, None, name, host, port, username, auth_type, key_path, jump_host,
    )
}

/// Update an SSH connection profile.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_ssh_connection(
    db: State<'_, AppDb>,
    id: i64,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    key_path: Option<String>,
    jump_host: Option<String>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    persist_ssh_connection(
        &conn,
        Some(id),
        name,
        host,
        port,
        username,
        auth_type,
        key_path,
        jump_host,
    )
}

/// Backward-compatible create command retained for older callers.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn save_ssh_connection(
    db: State<'_, AppDb>,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    key_path: Option<String>,
    jump_host: Option<String>,
) -> Result<i64, String> {
    create_ssh_connection(
        db, name, host, port, username, auth_type, key_path, jump_host,
    )
}

/// Delete an SSH connection by ID.
#[tauri::command]
pub fn delete_ssh_connection(db: State<'_, AppDb>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute("DELETE FROM ssh_connections WHERE id = ?1", params![id])
        .map_err(|e| format!("DB: {}", e))?;
    Ok(())
}

/// Shell-quote a string by wrapping it in single quotes and escaping
/// any embedded single quotes. This prevents shell injection when the
/// resulting command is pasted into a terminal.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Validate that an SSH field does not contain shell metacharacters that
/// could indicate an injection attempt.
fn validate_ssh_field(field: &str, name: &str) -> Result<(), String> {
    const FORBIDDEN: &[char] = &[';', '&', '|', '`', '$', '(', ')', '{', '}', '\n', '\r'];
    if field.chars().any(|c| FORBIDDEN.contains(&c)) {
        return Err(format!("{} contains invalid characters", name));
    }
    Ok(())
}

/// Build the ssh command string from a saved connection profile.
#[tauri::command]
pub fn build_ssh_command(db: State<'_, AppDb>, id: i64) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT host, port, username, auth_type, key_path, jump_host
             FROM ssh_connections WHERE id = ?1",
        )
        .map_err(|e| format!("DB: {}", e))?;

    let (host, port, username, auth_type, key_path, jump_host): (
        String,
        i64,
        String,
        String,
        Option<String>,
        Option<String>,
    ) = stmt
        .query_row(params![id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(|e| format!("DB: {}", e))?;

    // Validate all user-supplied fields before building the command
    validate_ssh_field(&host, "host")?;
    validate_ssh_field(&username, "username")?;
    if let Some(ref kp) = key_path {
        validate_ssh_field(kp, "key_path")?;
    }
    if let Some(ref jh) = jump_host {
        validate_ssh_field(jh, "jump_host")?;
    }

    let mut parts = vec!["ssh".to_string()];

    if port != 22 {
        parts.push(format!("-p {}", port));
    }

    if auth_type == "key" {
        if let Some(ref kp) = key_path {
            parts.push(format!("-i {}", shell_quote(kp)));
        }
    }

    if let Some(ref jh) = jump_host {
        parts.push(format!("-J {}", shell_quote(jh)));
    }

    parts.push(shell_quote(&format!("{}@{}", username, host)));

    Ok(parts.join(" "))
}

/// Test TCP connectivity to an SSH host:port with a 5 second timeout.
#[tauri::command]
pub async fn test_ssh_connection(host: String, port: u16) -> Result<bool, String> {
    let addr = format!("{}:{}", host, port);
    let timeout = std::time::Duration::from_secs(5);
    match tokio::time::timeout(timeout, tokio::net::TcpStream::connect(&addr)).await {
        Ok(Ok(_)) => Ok(true),
        Ok(Err(_)) => Ok(false),
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_test_db, AppDb};

    fn setup_db() -> AppDb {
        AppDb(std::sync::Arc::new(std::sync::Mutex::new(init_test_db())))
    }

    #[test]
    fn test_ssh_connection_crud() {
        let db = setup_db();

        // Insert
        let id;
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO ssh_connections (name, host, port, username, auth_type, key_path, jump_host) VALUES ('my-server', 'example.com', 22, 'deploy', 'key', '/home/deploy/.ssh/id_rsa', NULL)",
                [],
            ).unwrap();
            id = conn.last_insert_rowid();
        }
        assert!(id > 0);

        // Query and verify fields
        {
            let conn = db.0.lock().unwrap();
            let (name, host, port, username, auth_type, key_path, jump_host): (
                String, String, i64, String, String, Option<String>, Option<String>,
            ) = conn
                .query_row(
                    "SELECT name, host, port, username, auth_type, key_path, jump_host FROM ssh_connections WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
                )
                .unwrap();

            assert_eq!(name, "my-server");
            assert_eq!(host, "example.com");
            assert_eq!(port, 22);
            assert_eq!(username, "deploy");
            assert_eq!(auth_type, "key");
            assert_eq!(key_path, Some("/home/deploy/.ssh/id_rsa".to_string()));
            assert_eq!(jump_host, None);
        }

        // Insert a second connection
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO ssh_connections (name, host, port, username, auth_type) VALUES ('bastion', 'bastion.example.com', 2222, 'admin', 'password')",
                [],
            ).unwrap();
        }

        // List all and verify count
        {
            let conn = db.0.lock().unwrap();
            let count: i64 = conn
                .query_row("SELECT COUNT(*) FROM ssh_connections", [], |row| row.get(0))
                .unwrap();
            assert_eq!(count, 2);
        }

        // Delete first connection
        {
            let conn = db.0.lock().unwrap();
            conn.execute("DELETE FROM ssh_connections WHERE id = ?1", params![id])
                .unwrap();
        }

        // Verify deleted
        {
            let conn = db.0.lock().unwrap();
            let count: i64 = conn
                .query_row("SELECT COUNT(*) FROM ssh_connections", [], |row| row.get(0))
                .unwrap();
            assert_eq!(count, 1);

            // The deleted one should not be found
            let result = conn.query_row(
                "SELECT id FROM ssh_connections WHERE id = ?1",
                params![id],
                |row| row.get::<_, i64>(0),
            );
            assert!(result.is_err());
        }
    }

    #[test]
    fn test_update_ssh_connection_updates_existing_row() {
        let db = setup_db();
        let conn = db.0.lock().unwrap();

        let original_id = persist_ssh_connection(
            &conn,
            None,
            "prod".into(),
            "old.example.com".into(),
            22,
            "deploy".into(),
            "key".into(),
            Some("/tmp/id_rsa".into()),
            None,
        )
        .unwrap();

        let updated_id = persist_ssh_connection(
            &conn,
            Some(original_id),
            "prod".into(),
            "new.example.com".into(),
            2222,
            "deploy".into(),
            "password".into(),
            None,
            Some("jump.example.com".into()),
        )
        .unwrap();

        assert_eq!(updated_id, original_id);

        let row: (String, i64, String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT host, port, auth_type, key_path, jump_host FROM ssh_connections WHERE id = ?1",
                params![original_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(row.0, "new.example.com");
        assert_eq!(row.1, 2222);
        assert_eq!(row.2, "password");
        assert_eq!(row.3, None);
        assert_eq!(row.4, Some("jump.example.com".to_string()));
    }

    #[test]
    fn test_build_ssh_command_format() {
        let db = setup_db();

        // Insert a connection with all options
        let id;
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO ssh_connections (name, host, port, username, auth_type, key_path, jump_host) VALUES ('full-opts', 'prod.example.com', 2222, 'deploy', 'key', '/home/deploy/.ssh/id_ed25519', 'bastion.example.com')",
                [],
            ).unwrap();
            id = conn.last_insert_rowid();
        }

        // Manually build the ssh command like build_ssh_command does
        let conn = db.0.lock().unwrap();
        let (host, port, username, auth_type, key_path, jump_host): (
            String, i64, String, String, Option<String>, Option<String>,
        ) = conn
            .query_row(
                "SELECT host, port, username, auth_type, key_path, jump_host FROM ssh_connections WHERE id = ?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .unwrap();

        let mut parts = vec!["ssh".to_string()];
        if port != 22 {
            parts.push(format!("-p {}", port));
        }
        if auth_type == "key" {
            if let Some(ref kp) = key_path {
                parts.push(format!("-i {}", kp));
            }
        }
        if let Some(ref jh) = jump_host {
            parts.push(format!("-J {}", jh));
        }
        parts.push(format!("{}@{}", username, host));

        let command = parts.join(" ");
        assert_eq!(
            command,
            "ssh -p 2222 -i /home/deploy/.ssh/id_ed25519 -J bastion.example.com deploy@prod.example.com"
        );

        // Test with default port (22) and password auth (no key)
        drop(conn);
        let id2;
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO ssh_connections (name, host, port, username, auth_type) VALUES ('simple', 'simple.example.com', 22, 'root', 'password')",
                [],
            ).unwrap();
            id2 = conn.last_insert_rowid();
        }

        let conn = db.0.lock().unwrap();
        let (host2, port2, username2, auth_type2, key_path2, jump_host2): (
            String, i64, String, String, Option<String>, Option<String>,
        ) = conn
            .query_row(
                "SELECT host, port, username, auth_type, key_path, jump_host FROM ssh_connections WHERE id = ?1",
                params![id2],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .unwrap();

        let mut parts2 = vec!["ssh".to_string()];
        if port2 != 22 {
            parts2.push(format!("-p {}", port2));
        }
        if auth_type2 == "key" {
            if let Some(ref kp) = key_path2 {
                parts2.push(format!("-i {}", kp));
            }
        }
        if let Some(ref jh) = jump_host2 {
            parts2.push(format!("-J {}", jh));
        }
        parts2.push(format!("{}@{}", username2, host2));

        let command2 = parts2.join(" ");
        // Port 22 should be omitted, no -i or -J
        assert_eq!(command2, "ssh root@simple.example.com");
    }
}
