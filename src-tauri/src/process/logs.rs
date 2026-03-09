use crate::db::queries;
use crate::db::AppDb;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;

/// Payload emitted to the frontend for each log line.
#[derive(Debug, Clone, Serialize)]
pub struct LogLineEvent {
    pub process_id: i64,
    pub stream: String,
    pub content: String,
    pub timestamp: String,
}

/// Starts background tasks that read stdout/stderr from a child process,
/// store each line in the database, and emit Tauri events for real-time streaming.
pub fn capture_output(app_handle: AppHandle, process_id: i64, mut child: Child) {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Spawn a task to wait for the child to exit
    let app_exit = app_handle.clone();
    tokio::spawn(async move {
        let _ = child.wait().await;
        // Mark process as stopped when it exits
        let db = app_exit.state::<AppDb>();
        if let Ok(conn) = db.0.lock() {
            let _ = queries::update_process_stopped(&conn, process_id);
        };
    });

    // Capture stdout
    if let Some(out) = stdout {
        let app = app_handle.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(out);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                store_and_emit(&app, process_id, "stdout", &line);
            }
        });
    }

    // Capture stderr
    if let Some(err) = stderr {
        let app = app_handle.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(err);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                store_and_emit(&app, process_id, "stderr", &line);
            }
        });
    }
}

/// Store a log line in the database and emit a Tauri event.
fn store_and_emit(app: &AppHandle, process_id: i64, stream: &str, content: &str) {
    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Insert into DB (best-effort — don't crash if DB is locked)
    let db = app.state::<AppDb>();
    if let Ok(conn) = db.0.lock() {
        let _ = queries::insert_log(&conn, process_id, stream, content);
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
