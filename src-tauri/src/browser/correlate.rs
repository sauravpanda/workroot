use super::{BrowserError, BrowserEvent, CorrelatedEvent, NetworkFailure, RelatedLog};
use crate::db::AppDb;
use rusqlite::params;
use tauri::State;

/// Store a browser error event.
pub fn receive_error(db: &AppDb, error: &BrowserError) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let details = serde_json::json!({
        "type": error.error_type,
        "source": error.source,
        "line": error.line,
        "column": error.column,
        "stack": error.stack,
        "user_agent": error.user_agent,
    })
    .to_string();

    conn.execute(
        "INSERT INTO browser_events (event_type, message, url, details, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            "error",
            &error.message,
            &error.page_url,
            &details,
            &error.timestamp,
        ],
    )
    .map_err(|e| format!("Insert browser error: {}", e))?;

    Ok(conn.last_insert_rowid())
}

/// Store a network failure event.
pub fn receive_network_failure(db: &AppDb, failure: &NetworkFailure) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let details = serde_json::json!({
        "method": failure.method,
        "response_body": failure.response_body,
        "request_body": failure.request_body,
        "duration_ms": failure.duration_ms,
        "page_url": failure.page_url,
    })
    .to_string();

    conn.execute(
        "INSERT INTO browser_events (event_type, message, url, status_code, details, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            "network_failure",
            format!("{} {} -> {}", failure.method, failure.url, failure.status_code),
            &failure.url,
            failure.status_code as i64,
            &details,
            &failure.timestamp,
        ],
    )
    .map_err(|e| format!("Insert network failure: {}", e))?;

    Ok(conn.last_insert_rowid())
}

/// Get recent browser events.
#[tauri::command]
pub fn get_browser_events(
    db: State<'_, AppDb>,
    limit: Option<i64>,
) -> Result<Vec<BrowserEvent>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let limit = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT id, event_type, message, url, status_code, details, timestamp
             FROM browser_events ORDER BY timestamp DESC LIMIT ?1",
        )
        .map_err(|e| format!("Query: {}", e))?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(BrowserEvent {
                id: row.get(0)?,
                event_type: row.get(1)?,
                message: row.get(2)?,
                url: row.get(3)?,
                status_code: row.get(4)?,
                details: row.get(5)?,
                timestamp: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    Ok(results)
}

/// Correlate a browser event with server logs within a 2-second window.
#[tauri::command]
pub fn get_correlated_event(
    db: State<'_, AppDb>,
    event_id: i64,
) -> Result<CorrelatedEvent, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Get the browser event
    let event = conn
        .query_row(
            "SELECT id, event_type, message, url, status_code, details, timestamp
             FROM browser_events WHERE id = ?1",
            params![event_id],
            |row| {
                Ok(BrowserEvent {
                    id: row.get(0)?,
                    event_type: row.get(1)?,
                    message: row.get(2)?,
                    url: row.get(3)?,
                    status_code: row.get(4)?,
                    details: row.get(5)?,
                    timestamp: row.get(6)?,
                })
            },
        )
        .map_err(|e| format!("Event not found: {}", e))?;

    // Find server logs within 2 seconds of the event
    let mut stmt = conn
        .prepare(
            "SELECT l.process_id, l.stream, l.content, l.timestamp
             FROM logs l
             WHERE l.timestamp BETWEEN datetime(?1, '-2 seconds') AND datetime(?1, '+2 seconds')
             ORDER BY l.timestamp ASC
             LIMIT 50",
        )
        .map_err(|e| format!("Query: {}", e))?;

    let log_rows = stmt
        .query_map(params![&event.timestamp], |row| {
            Ok(RelatedLog {
                process_id: row.get(0)?,
                stream: row.get(1)?,
                content: row.get(2)?,
                timestamp: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut server_logs = Vec::new();
    for row in log_rows {
        server_logs.push(row.map_err(|e| format!("Row: {}", e))?);
    }

    Ok(CorrelatedEvent {
        browser_event: event,
        server_logs,
    })
}
