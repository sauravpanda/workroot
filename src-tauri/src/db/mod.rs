use rusqlite::Connection;
use std::fs;
use std::sync::Mutex;
use std::sync::MutexGuard;
use tauri::{AppHandle, Manager};
use thiserror::Error;

pub mod queries;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Failed to resolve app data directory")]
    NoAppDataDir,
}

impl From<DbError> for tauri::Error {
    fn from(e: DbError) -> Self {
        tauri::Error::Anyhow(e.into())
    }
}

/// Thread-safe wrapper around a SQLite connection for use as Tauri managed state.
pub struct AppDb(pub Mutex<Connection>);

impl AppDb {
    /// Acquire the database connection.
    ///
    /// If the mutex is poisoned (a previous thread panicked while holding it),
    /// the inner connection is recovered and reused. SQLite transactions are
    /// atomic, so any incomplete work from the panicking thread was already
    /// rolled back, making recovery safe.
    ///
    /// Use this in background workers and helpers. For Tauri command handlers
    /// that already propagate `Result<_, String>`, prefer the explicit
    /// `db.0.lock().map_err(...)` pattern so the frontend receives a clear error.
    pub fn conn(&self) -> MutexGuard<'_, Connection> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Initializes the SQLite database in the app's data directory.
/// Creates all required tables, indexes, and triggers if they do not already exist.
/// Returns an `AppDb` suitable for registration as Tauri managed state.
pub fn init_db(app: &AppHandle) -> Result<AppDb, DbError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| DbError::NoAppDataDir)?;

    fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("workroot.db");
    let conn = Connection::open(&db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    run_migrations(&conn)?;

    Ok(AppDb(Mutex::new(conn)))
}

/// Applies the schema from schema.sql. All statements use IF NOT EXISTS,
/// so this is safe to call on every startup.
fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    const SCHEMA: &str = include_str!("schema.sql");
    conn.execute_batch(SCHEMA)?;
    // Graceful migration: add deleted_at column if it doesn't exist yet
    let _ = conn.execute_batch(
        "ALTER TABLE worktrees ADD COLUMN deleted_at TEXT DEFAULT NULL;",
    );
    Ok(())
}

/// Creates an in-memory database with the full schema applied.
/// Useful for testing without touching the filesystem.
#[cfg(test)]
pub fn init_test_db() -> Connection {
    let conn = Connection::open_in_memory().expect("failed to open in-memory db");
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    run_migrations(&conn).unwrap();
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_applies_cleanly() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        run_migrations(&conn).unwrap();
    }

    #[test]
    fn schema_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap();
    }

    #[test]
    fn all_tables_exist() {
        let conn = init_test_db();
        let expected = [
            "projects",
            "worktrees",
            "env_profiles",
            "env_vars",
            "processes",
            "logs",
            "shell_history",
            "memory_notes",
            "file_events",
            "network_traffic",
            "browser_events",
            "settings",
        ];
        for table in &expected {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "table '{}' should exist", table);
        }
    }

    #[test]
    fn indexes_exist() {
        let conn = init_test_db();
        let expected_indexes = [
            "idx_worktrees_project_id",
            "idx_env_profiles_project_id",
            "idx_env_vars_profile_id",
            "idx_processes_worktree_id",
            "idx_logs_process_id",
            "idx_logs_timestamp",
            "idx_shell_history_project_id",
            "idx_shell_history_timestamp",
            "idx_memory_notes_worktree_id",
            "idx_file_events_project_id",
            "idx_file_events_timestamp",
            "idx_network_traffic_process_id",
            "idx_network_traffic_timestamp",
            "idx_browser_events_timestamp",
            "idx_browser_events_type",
        ];
        for idx in &expected_indexes {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?1",
                    [idx],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "index '{}' should exist", idx);
        }
    }

    #[test]
    fn foreign_keys_enforced() {
        let conn = init_test_db();
        let result = conn.execute(
            "INSERT INTO worktrees (project_id, branch_name, path) VALUES (9999, 'main', '/tmp')",
            [],
        );
        assert!(result.is_err(), "FK violation should be rejected");
    }

    #[test]
    fn logs_ring_buffer_trigger() {
        let conn = init_test_db();

        // Set up parent rows
        conn.execute(
            "INSERT INTO projects (id, name, local_path) VALUES (1, 'test', '/tmp')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO worktrees (id, project_id, branch_name, path) VALUES (1, 1, 'main', '/tmp')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO processes (id, worktree_id, command) VALUES (1, 1, 'npm start')",
            [],
        )
        .unwrap();

        // Insert 50,010 log rows
        let tx = conn.unchecked_transaction().unwrap();
        for i in 0..50_010 {
            tx.execute(
                "INSERT INTO logs (process_id, stream, content) VALUES (1, 'stdout', ?1)",
                [format!("line {}", i)],
            )
            .unwrap();
        }
        tx.commit().unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM logs WHERE process_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            count <= 50_000,
            "ring buffer should cap logs at 50,000 but found {}",
            count
        );
    }
}
