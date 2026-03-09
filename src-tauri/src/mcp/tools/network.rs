use crate::db::AppDb;
use crate::network::logging;
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// Get recent HTTP traffic.
pub fn get_http_traffic(
    app: &AppHandle,
    method: Option<&str>,
    url_pattern: Option<&str>,
    status_min: Option<i64>,
    status_max: Option<i64>,
    limit: Option<i64>,
) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let entries = logging::get_traffic(
        &db,
        method,
        url_pattern,
        status_min,
        status_max,
        limit.unwrap_or(50),
    )?;

    // Truncate response bodies to 1KB for MCP output
    let entries: Vec<Value> = entries
        .into_iter()
        .map(|e| {
            serde_json::json!({
                "id": e.id,
                "method": e.method,
                "url": e.url,
                "status_code": e.status_code,
                "duration_ms": e.duration_ms,
                "request_headers": e.request_headers,
                "request_body": truncate_for_mcp(e.request_body.as_deref()),
                "response_headers": e.response_headers,
                "response_body": truncate_for_mcp(e.response_body.as_deref()),
                "timestamp": e.timestamp,
            })
        })
        .collect();

    Ok(serde_json::json!({ "traffic": entries, "count": entries.len() }))
}

/// Get failed requests (4xx/5xx).
pub fn get_failed_requests(app: &AppHandle, limit: Option<i64>) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let entries = logging::get_failed_requests(&db, limit.unwrap_or(50))?;

    let entries: Vec<Value> = entries
        .into_iter()
        .map(|e| {
            serde_json::json!({
                "method": e.method,
                "url": e.url,
                "status_code": e.status_code,
                "duration_ms": e.duration_ms,
                "response_body": truncate_for_mcp(e.response_body.as_deref()),
                "timestamp": e.timestamp,
            })
        })
        .collect();

    Ok(serde_json::json!({ "failed_requests": entries, "count": entries.len() }))
}

/// Search traffic by URL pattern.
pub fn search_http_traffic(
    app: &AppHandle,
    url_pattern: &str,
    limit: Option<i64>,
) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let entries = logging::search_traffic(&db, url_pattern, limit.unwrap_or(50))?;

    let entries: Vec<Value> = entries
        .into_iter()
        .map(|e| {
            serde_json::json!({
                "method": e.method,
                "url": e.url,
                "status_code": e.status_code,
                "duration_ms": e.duration_ms,
                "timestamp": e.timestamp,
            })
        })
        .collect();

    Ok(serde_json::json!({ "results": entries, "count": entries.len() }))
}

fn truncate_for_mcp(body: Option<&str>) -> Option<String> {
    body.map(|b| {
        if b.len() > 1024 {
            format!("{}...[truncated]", &b[..1024])
        } else {
            b.to_string()
        }
    })
}
