use crate::db::queries;
use crate::db::AppDb;
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// MCP tool: get recent shell history for a worktree.
pub fn get_shell_history(
    app: &AppHandle,
    worktree_id: i64,
    limit: Option<i64>,
) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let limit = limit.unwrap_or(50).min(500);
    let history = queries::get_shell_history(
        &conn,
        worktree.project_id,
        Some(&worktree.branch_name),
        limit,
    )
    .map_err(|e| format!("DB: {}", e))?;

    serde_json::to_value(&history).map_err(|e| format!("Serialize: {}", e))
}

/// MCP tool: search shell history for a worktree.
pub fn search_shell_history(
    app: &AppHandle,
    worktree_id: i64,
    query: &str,
) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let results = queries::search_shell_history(&conn, worktree.project_id, query, 500)
        .map_err(|e| format!("DB: {}", e))?;

    serde_json::to_value(&results).map_err(|e| format!("Serialize: {}", e))
}
