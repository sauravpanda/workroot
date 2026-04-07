use super::ProxyState;
use crate::db::queries;
use crate::db::AppDb;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct ActiveProjectInfo {
    pub worktree_id: i64,
    pub project_name: String,
    pub branch_name: String,
    pub port: u16,
}

/// Tauri command: set the active project by worktree ID.
/// Looks up the worktree's running process to determine the port.
#[tauri::command]
pub fn set_active_project(
    db: State<'_, AppDb>,
    proxy: State<'_, ProxyState>,
    worktree_id: i64,
) -> Result<ActiveProjectInfo, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    let project = queries::get_project(&conn, worktree.project_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found")?;

    // Find the running process for this worktree
    let processes =
        queries::list_processes(&conn, worktree_id).map_err(|e| format!("DB error: {}", e))?;

    let running_proc = processes
        .iter()
        .find(|p| p.status == "running")
        .ok_or("No running process for this worktree")?;

    let port = running_proc
        .port
        .ok_or("Running process has no assigned port")? as u16;

    proxy.set_active(port, worktree_id);

    Ok(ActiveProjectInfo {
        worktree_id,
        project_name: project.name,
        branch_name: worktree.branch_name,
        port,
    })
}

/// Tauri command: get the currently active project.
#[tauri::command]
pub fn get_active_project(
    db: State<'_, AppDb>,
    proxy: State<'_, ProxyState>,
) -> Result<Option<ActiveProjectInfo>, String> {
    let worktree_id = proxy.get_active_worktree_id();

    let worktree_id = match worktree_id {
        Some(id) => id,
        None => return Ok(None),
    };

    let port = proxy.get_active_port();
    if port == 0 {
        return Ok(None);
    }

    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let worktree =
        match queries::get_worktree(&conn, worktree_id).map_err(|e| format!("DB error: {}", e))? {
            Some(w) => w,
            None => {
                proxy.clear_active();
                return Ok(None);
            }
        };

    let project = match queries::get_project(&conn, worktree.project_id)
        .map_err(|e| format!("DB error: {}", e))?
    {
        Some(p) => p,
        None => {
            proxy.clear_active();
            return Ok(None);
        }
    };

    Ok(Some(ActiveProjectInfo {
        worktree_id,
        project_name: project.name,
        branch_name: worktree.branch_name,
        port,
    }))
}

/// Tauri command: clear the active project (stop routing).
#[tauri::command]
pub fn clear_active_project(proxy: State<'_, ProxyState>) -> Result<(), String> {
    proxy.clear_active();
    Ok(())
}
