use super::{DbConfig, DbType};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Schema cache with TTL.
pub struct SchemaCache {
    entries: Mutex<HashMap<String, (SchemaInfo, Instant)>>,
}

impl Default for SchemaCache {
    fn default() -> Self {
        Self::new()
    }
}

impl SchemaCache {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    pub fn get(&self, key: &str) -> Option<SchemaInfo> {
        let entries = self.entries.lock().ok()?;
        let (schema, created) = entries.get(key)?;
        if created.elapsed() < Duration::from_secs(60) {
            Some(schema.clone())
        } else {
            None
        }
    }

    pub fn set(&self, key: String, schema: SchemaInfo) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.insert(key, (schema, Instant::now()));
        }
    }

    pub fn invalidate(&self, key: &str) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.remove(key);
        }
    }
}

/// Full database schema info.
#[derive(Debug, Clone, Serialize)]
pub struct SchemaInfo {
    pub db_type: String,
    pub tables: Vec<TableInfo>,
}

/// Table with columns and metadata.
#[derive(Debug, Clone, Serialize)]
pub struct TableInfo {
    pub name: String,
    pub row_count: Option<i64>,
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<IndexInfo>,
    pub foreign_keys: Vec<ForeignKeyInfo>,
}

/// Column definition.
#[derive(Debug, Clone, Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub is_primary_key: bool,
}

/// Index definition.
#[derive(Debug, Clone, Serialize)]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub unique: bool,
}

/// Foreign key relationship.
#[derive(Debug, Clone, Serialize)]
pub struct ForeignKeyInfo {
    pub column: String,
    pub references_table: String,
    pub references_column: String,
}

/// Introspect schema from a database config.
/// Currently only SQLite is supported. Postgres and MySQL return an explicit
/// unsupported error so callers can surface a clear message instead of a
/// misleading empty schema.
pub fn introspect_schema(config: &DbConfig) -> Result<SchemaInfo, String> {
    match config.db_type {
        DbType::Sqlite => introspect_sqlite(config),
        DbType::Postgres => Err(
            "PostgreSQL schema introspection is not yet implemented. \
             Connect to a SQLite database to use this feature."
                .into(),
        ),
        DbType::Mysql => Err(
            "MySQL schema introspection is not yet implemented. \
             Connect to a SQLite database to use this feature."
                .into(),
        ),
    }
}

fn introspect_sqlite(config: &DbConfig) -> Result<SchemaInfo, String> {
    let db_path = config
        .database
        .as_deref()
        .ok_or("No database path for SQLite")?;

    let conn = rusqlite::Connection::open(db_path).map_err(|e| format!("SQLite open: {}", e))?;

    // Get all user tables
    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(|e| format!("Query: {}", e))?;

    let table_names: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Query: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut tables = Vec::new();

    for table_name in &table_names {
        let table = introspect_sqlite_table(&conn, table_name)?;
        tables.push(table);
    }

    Ok(SchemaInfo {
        db_type: "sqlite".into(),
        tables,
    })
}

fn introspect_sqlite_table(
    conn: &rusqlite::Connection,
    table_name: &str,
) -> Result<TableInfo, String> {
    // Get row count
    let row_count: Option<i64> = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM \"{}\"", table_name),
            [],
            |row| row.get(0),
        )
        .ok();

    // Get columns via PRAGMA
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{}\")", table_name))
        .map_err(|e| format!("PRAGMA: {}", e))?;

    let columns: Vec<ColumnInfo> = stmt
        .query_map([], |row| {
            Ok(ColumnInfo {
                name: row.get(1)?,
                data_type: row.get(2)?,
                nullable: {
                    let notnull: i64 = row.get(3)?;
                    notnull == 0
                },
                default_value: row.get(4)?,
                is_primary_key: {
                    let pk: i64 = row.get(5)?;
                    pk > 0
                },
            })
        })
        .map_err(|e| format!("Columns: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Get indexes
    let mut idx_stmt = conn
        .prepare(&format!("PRAGMA index_list(\"{}\")", table_name))
        .map_err(|e| format!("Indexes: {}", e))?;

    let indexes: Vec<IndexInfo> = idx_stmt
        .query_map([], |row| {
            let name: String = row.get(1)?;
            let unique: i64 = row.get(2)?;
            Ok((name, unique > 0))
        })
        .map_err(|e| format!("Indexes: {}", e))?
        .filter_map(|r| r.ok())
        .map(|(name, unique)| {
            let cols = get_index_columns(conn, &name);
            IndexInfo {
                name,
                columns: cols,
                unique,
            }
        })
        .collect();

    // Get foreign keys
    let mut fk_stmt = conn
        .prepare(&format!("PRAGMA foreign_key_list(\"{}\")", table_name))
        .map_err(|e| format!("FKs: {}", e))?;

    let foreign_keys: Vec<ForeignKeyInfo> = fk_stmt
        .query_map([], |row| {
            Ok(ForeignKeyInfo {
                column: row.get(3)?,
                references_table: row.get(2)?,
                references_column: row.get(4)?,
            })
        })
        .map_err(|e| format!("FKs: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(TableInfo {
        name: table_name.to_string(),
        row_count,
        columns,
        indexes,
        foreign_keys,
    })
}

fn get_index_columns(conn: &rusqlite::Connection, index_name: &str) -> Vec<String> {
    let mut stmt = match conn.prepare(&format!("PRAGMA index_info(\"{}\")", index_name)) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let result: Vec<String> = match stmt.query_map([], |row| row.get::<_, String>(2)) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(_) => vec![],
    };
    result
}

/// Tauri command: get database schema for a worktree.
#[tauri::command]
pub fn get_db_schema(
    app: tauri::AppHandle,
    worktree_id: i64,
) -> Result<Option<SchemaInfo>, String> {
    use tauri::Manager;

    let config = super::detect::detect_database(&app, worktree_id)?;
    let config = match config {
        Some(c) => c,
        None => return Ok(None),
    };

    // Check cache
    let cache = app.state::<SchemaCache>();
    let cache_key = format!("{}:{}", worktree_id, config.url);
    if let Some(cached) = cache.get(&cache_key) {
        return Ok(Some(cached));
    }

    let schema = introspect_schema(&config)?;
    cache.set(cache_key, schema.clone());
    Ok(Some(schema))
}

/// Tauri command: force refresh schema cache.
#[tauri::command]
pub fn refresh_db_schema(
    app: tauri::AppHandle,
    worktree_id: i64,
) -> Result<Option<SchemaInfo>, String> {
    use tauri::Manager;

    let config = super::detect::detect_database(&app, worktree_id)?;
    let config = match config {
        Some(c) => c,
        None => return Ok(None),
    };

    let cache = app.state::<SchemaCache>();
    let cache_key = format!("{}:{}", worktree_id, config.url);
    cache.invalidate(&cache_key);

    let schema = introspect_schema(&config)?;
    cache.set(cache_key, schema.clone());
    Ok(Some(schema))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn introspect_sqlite_test_db() {
        // Create a temp SQLite database
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT);
             CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT NOT NULL);
             CREATE INDEX idx_posts_user ON posts(user_id);
             INSERT INTO users (name, email) VALUES ('Alice', 'alice@test.com');
             INSERT INTO users (name, email) VALUES ('Bob', NULL);
             INSERT INTO posts (user_id, title) VALUES (1, 'Hello World');",
        )
        .unwrap();
        drop(conn);

        let config = DbConfig {
            db_type: DbType::Sqlite,
            url: format!("sqlite:{}", db_path.display()),
            host: None,
            port: None,
            database: Some(db_path.to_string_lossy().to_string()),
            username: None,
        };

        let schema = introspect_schema(&config).unwrap();

        assert_eq!(schema.db_type, "sqlite");
        assert_eq!(schema.tables.len(), 2);

        let users = schema.tables.iter().find(|t| t.name == "users").unwrap();
        assert_eq!(users.row_count, Some(2));
        assert_eq!(users.columns.len(), 3);

        let id_col = users.columns.iter().find(|c| c.name == "id").unwrap();
        assert!(id_col.is_primary_key);

        let name_col = users.columns.iter().find(|c| c.name == "name").unwrap();
        assert!(!name_col.nullable);

        let posts = schema.tables.iter().find(|t| t.name == "posts").unwrap();
        assert_eq!(posts.row_count, Some(1));
        assert!(!posts.foreign_keys.is_empty());
        assert_eq!(posts.foreign_keys[0].references_table, "users");
    }

    #[test]
    fn schema_cache_works() {
        let cache = SchemaCache::new();

        let schema = SchemaInfo {
            db_type: "sqlite".into(),
            tables: vec![],
        };

        cache.set("test-key".into(), schema.clone());

        let cached = cache.get("test-key");
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().db_type, "sqlite");

        cache.invalidate("test-key");
        assert!(cache.get("test-key").is_none());
    }
}
