use crate::db::AppDb;
use crate::filewatcher::{analysis, tracker};
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// Get file hotspots — most frequently changed files.
pub fn get_file_hotspots(
    app: &AppHandle,
    project_id: i64,
    period: Option<&str>,
) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let period = period.unwrap_or("24h");
    let hot_files = analysis::get_hot_files(&db, project_id, period)?;

    Ok(serde_json::json!({
        "period": period,
        "hot_files": hot_files,
        "count": hot_files.len(),
    }))
}

/// Get files that co-change with the given file.
pub fn get_related_files(
    app: &AppHandle,
    project_id: i64,
    file_path: &str,
) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let co_changes = analysis::get_co_changes(&db, project_id, file_path)?;

    Ok(serde_json::json!({
        "file": file_path,
        "related_files": co_changes,
        "count": co_changes.len(),
    }))
}

/// Get recent file change log.
pub fn get_recent_file_changes(
    app: &AppHandle,
    project_id: i64,
    limit: Option<i64>,
) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let events = tracker::get_recent_events(&db, project_id, limit.unwrap_or(50))?;

    Ok(serde_json::json!({
        "events": events,
        "count": events.len(),
    }))
}
