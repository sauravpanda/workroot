pub mod hook;

use crate::db::queries;
use crate::db::AppDb;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Payload sent by the shell hook scripts.
#[derive(Debug, Deserialize, Serialize)]
pub struct ShellCommand {
    pub command: String,
    pub exit_code: Option<i64>,
    pub cwd: String,
    pub timestamp: Option<String>,
}

#[tauri::command]
pub fn install_shell_hook(shell_type: String) -> Result<String, String> {
    let st = hook::ShellType::parse(&shell_type)
        .ok_or_else(|| format!("Unsupported shell: {}", shell_type))?;
    hook::install_hook(st)
}

#[tauri::command]
pub fn uninstall_shell_hook(shell_type: String) -> Result<(), String> {
    let st = hook::ShellType::parse(&shell_type)
        .ok_or_else(|| format!("Unsupported shell: {}", shell_type))?;
    hook::uninstall_hook(st)
}

#[tauri::command]
pub fn get_shell_history(
    db: State<'_, AppDb>,
    project_id: i64,
    branch: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<queries::ShellHistoryRow>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let limit = limit.unwrap_or(50).min(500);
    queries::get_shell_history(&conn, project_id, branch.as_deref(), limit)
        .map_err(|e| format!("DB: {}", e))
}

#[tauri::command]
pub fn search_shell_history(
    db: State<'_, AppDb>,
    project_id: i64,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<queries::ShellHistoryRow>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let limit = limit.unwrap_or(100).min(500);
    queries::search_shell_history(&conn, project_id, &query, limit)
        .map_err(|e| format!("DB: {}", e))
}
