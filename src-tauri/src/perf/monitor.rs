use crate::db::AppDb;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct AppMetrics {
    pub uptime_seconds: u64,
    pub memory_usage_mb: f64,
    pub db_size_bytes: u64,
    pub active_watchers: usize,
    pub active_processes: usize,
    pub total_projects: i64,
    pub total_worktrees: i64,
}

/// Get application metrics including DB stats and counts.
#[tauri::command]
pub fn get_app_metrics(db: State<'_, AppDb>) -> Result<AppMetrics, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Get DB size via PRAGMA
    let page_count: u64 = conn
        .query_row("PRAGMA page_count", [], |row| row.get(0))
        .map_err(|e| format!("DB: {}", e))?;
    let page_size: u64 = conn
        .query_row("PRAGMA page_size", [], |row| row.get(0))
        .map_err(|e| format!("DB: {}", e))?;
    let db_size_bytes = page_count * page_size;

    // Count projects
    let total_projects: i64 = conn
        .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
        .map_err(|e| format!("DB: {}", e))?;

    // Count worktrees
    let total_worktrees: i64 = conn
        .query_row("SELECT COUNT(*) FROM worktrees", [], |row| row.get(0))
        .map_err(|e| format!("DB: {}", e))?;

    Ok(AppMetrics {
        uptime_seconds: 0,
        memory_usage_mb: 0.0,
        db_size_bytes,
        active_watchers: 0,
        active_processes: 0,
        total_projects,
        total_worktrees,
    })
}
