use crate::db::queries;
use crate::db::AppDb;
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// Returns recent log lines for a process.
pub fn get_recent_logs(
    app: &AppHandle,
    process_id: i64,
    lines: Option<i64>,
    stream: Option<&str>,
) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Verify process exists
    queries::get_process(&conn, process_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Process not found")?;

    let limit = lines.unwrap_or(50).min(500);
    let mut logs =
        queries::get_logs(&conn, process_id, limit).map_err(|e| format!("DB error: {}", e))?;

    // Reverse to chronological order (get_logs returns DESC)
    logs.reverse();

    // Filter by stream if specified
    let filtered: Vec<Value> = logs
        .iter()
        .filter(|l| match stream {
            Some("stdout") => l.stream == "stdout",
            Some("stderr") => l.stream == "stderr",
            _ => true,
        })
        .map(|l| {
            serde_json::json!({
                "stream": l.stream,
                "content": l.content,
                "timestamp": l.timestamp,
            })
        })
        .collect();

    Ok(serde_json::json!({
        "process_id": process_id,
        "count": filtered.len(),
        "logs": filtered,
    }))
}

/// Searches log content for a process.
pub fn search_logs(app: &AppHandle, process_id: i64, query: &str) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    queries::get_process(&conn, process_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Process not found")?;

    let results =
        queries::search_logs(&conn, process_id, query).map_err(|e| format!("DB error: {}", e))?;

    let matches: Vec<Value> = results
        .iter()
        .take(500)
        .map(|l| {
            serde_json::json!({
                "stream": l.stream,
                "content": l.content,
                "timestamp": l.timestamp,
            })
        })
        .collect();

    Ok(serde_json::json!({
        "process_id": process_id,
        "query": query,
        "count": matches.len(),
        "matches": matches,
    }))
}

/// Returns stderr-only log lines (error logs shortcut).
pub fn get_error_logs(
    app: &AppHandle,
    process_id: i64,
    lines: Option<i64>,
) -> Result<Value, String> {
    get_recent_logs(app, process_id, lines, Some("stderr"))
}
