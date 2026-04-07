use crate::db::queries;
use crate::db::AppDb;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, State};

/// Payload emitted to the frontend for each log line.
#[derive(Debug, Clone, Serialize)]
pub struct LogLineEvent {
    pub process_id: i64,
    pub stream: String,
    pub content: String,
    pub timestamp: String,
}

/// Maximum log lines to store per process before pruning old entries.
const MAX_LINES_PER_PROCESS: i64 = 50_000;

/// Prune every N inserts to avoid checking on every line.
const PRUNE_CHECK_INTERVAL: u64 = 1_000;

/// Global insert counter for periodic pruning.
static INSERT_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Store a log line in the database and emit a Tauri event.
/// Periodically prunes old log lines to prevent unbounded DB growth.
pub fn store_and_emit(app: &AppHandle, process_id: i64, stream: &str, content: &str) {
    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Insert into DB (best-effort — don't crash if DB is locked)
    let db = app.state::<AppDb>();
    if let Ok(conn) = db.0.lock() {
        let _ = queries::insert_log(&conn, process_id, stream, content);

        // Periodically prune old logs to cap memory/disk usage
        let count = INSERT_COUNTER.fetch_add(1, Ordering::Relaxed);
        if count.is_multiple_of(PRUNE_CHECK_INTERVAL) {
            let _ = conn.execute(
                "DELETE FROM process_logs WHERE process_id = ?1 AND id NOT IN (
                    SELECT id FROM process_logs WHERE process_id = ?1
                    ORDER BY id DESC LIMIT ?2
                )",
                rusqlite::params![process_id, MAX_LINES_PER_PROCESS],
            );
        }
    }

    // Emit event to frontend
    let event = LogLineEvent {
        process_id,
        stream: stream.to_string(),
        content: content.to_string(),
        timestamp,
    };
    let _ = app.emit("process-log", &event);
}

/// Tauri command: get recent logs for a process.
#[tauri::command]
pub fn get_process_logs(
    db: State<'_, AppDb>,
    process_id: i64,
    limit: Option<i64>,
) -> Result<Vec<queries::LogRow>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let limit = limit.unwrap_or(500);
    let mut logs =
        queries::get_logs(&conn, process_id, limit).map_err(|e| format!("DB error: {}", e))?;
    // get_logs returns DESC order; reverse so frontend gets chronological order
    logs.reverse();
    Ok(logs)
}

/// Tauri command: search log lines for a process.
#[tauri::command]
pub fn search_process_logs(
    db: State<'_, AppDb>,
    process_id: i64,
    query: String,
) -> Result<Vec<queries::LogRow>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::search_logs(&conn, process_id, &query).map_err(|e| format!("DB error: {}", e))
}

/// Tauri command: clear all logs for a process.
#[tauri::command]
pub fn clear_process_logs(db: State<'_, AppDb>, process_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::clear_logs(&conn, process_id).map_err(|e| format!("DB error: {}", e))
}
