use rusqlite::Connection;
use std::fs;
use tauri::{AppHandle, Manager};
use thiserror::Error;

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

/// Initializes the SQLite database in the app's data directory.
/// Creates all required tables if they do not already exist.
pub fn init_db(app: &AppHandle) -> Result<Connection, DbError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| DbError::NoAppDataDir)?;

    fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("workroot.db");
    let conn = Connection::open(&db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    create_tables(&conn)?;

    Ok(conn)
}

fn create_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS projects (
            id              INTEGER PRIMARY KEY,
            github_repo_id  TEXT,
            name            TEXT NOT NULL,
            clone_path      TEXT NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS worktrees (
            id              INTEGER PRIMARY KEY,
            project_id      INTEGER NOT NULL REFERENCES projects(id),
            branch          TEXT NOT NULL,
            path            TEXT NOT NULL,
            is_active       INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS env_profiles (
            id              INTEGER PRIMARY KEY,
            project_id      INTEGER NOT NULL REFERENCES projects(id),
            name            TEXT NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS env_vars (
            id                  INTEGER PRIMARY KEY,
            profile_id          INTEGER NOT NULL REFERENCES env_profiles(id),
            key                 TEXT NOT NULL,
            encrypted_value_ref TEXT
        );

        CREATE TABLE IF NOT EXISTS processes (
            id              INTEGER PRIMARY KEY,
            worktree_id     INTEGER NOT NULL REFERENCES worktrees(id),
            pid             INTEGER,
            port            INTEGER,
            status          TEXT NOT NULL DEFAULT 'stopped',
            start_command   TEXT NOT NULL,
            started_at      TEXT
        );

        CREATE TABLE IF NOT EXISTS log_entries (
            id              INTEGER PRIMARY KEY,
            process_id      INTEGER NOT NULL REFERENCES processes(id),
            level           TEXT NOT NULL DEFAULT 'info',
            message         TEXT NOT NULL,
            timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS memory_items (
            id              INTEGER PRIMARY KEY,
            worktree_id     INTEGER NOT NULL REFERENCES worktrees(id),
            type            TEXT NOT NULL CHECK(type IN ('note','dead_end','decision')),
            content         TEXT NOT NULL,
            embedding       BLOB,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS shell_commands (
            id              INTEGER PRIMARY KEY,
            project_id      INTEGER NOT NULL REFERENCES projects(id),
            command         TEXT NOT NULL,
            exit_code       INTEGER,
            branch          TEXT,
            timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS http_requests (
            id              INTEGER PRIMARY KEY,
            project_id      INTEGER NOT NULL REFERENCES projects(id),
            method          TEXT NOT NULL,
            path            TEXT NOT NULL,
            status          INTEGER,
            req_body        TEXT,
            res_body        TEXT,
            timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS file_events (
            id              INTEGER PRIMARY KEY,
            project_id      INTEGER NOT NULL REFERENCES projects(id),
            file_path       TEXT NOT NULL,
            event_type      TEXT NOT NULL,
            timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
        );
        ",
    )?;

    Ok(())
}
