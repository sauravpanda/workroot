use crate::db::queries;
use crate::db::AppDb;
use crate::proxy::ProxyState;
use serde_json::Value;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};

/// Returns info about the currently active proxy target.
pub fn get_active_proxy(app: &AppHandle) -> Result<Value, String> {
    let proxy = app.state::<ProxyState>();
    let port = proxy.get_active_port();
    let running = proxy.proxy_running.load(Ordering::Relaxed);

    if port == 0 {
        return Ok(serde_json::json!({
            "proxy_running": running > 0,
            "active": false,
            "message": "No project is currently routed through :3000"
        }));
    }

    let worktree_id = proxy.active_worktree_id.lock().map(|w| *w).unwrap_or(None);

    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let mut info = serde_json::json!({
        "proxy_running": true,
        "active": true,
        "target_port": port,
    });

    if let Some(wt_id) = worktree_id {
        if let Ok(Some(wt)) = queries::get_worktree(&conn, wt_id) {
            if let Ok(Some(proj)) = queries::get_project(&conn, wt.project_id) {
                info["worktree_id"] = serde_json::json!(wt_id);
                info["project_name"] = serde_json::json!(proj.name);
                info["branch"] = serde_json::json!(wt.branch_name);
            }
        }
    }

    Ok(info)
}

/// Switches the proxy target to a different worktree.
pub fn switch_active_proxy(app: &AppHandle, worktree_id: i64) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    let project = queries::get_project(&conn, worktree.project_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found")?;

    // Find running process
    let processes =
        queries::list_processes(&conn, worktree_id).map_err(|e| format!("DB error: {}", e))?;
    let running = processes
        .iter()
        .find(|p| p.status == "running")
        .ok_or("No running process for this worktree")?;
    let port = running.port.ok_or("Running process has no assigned port")? as u16;

    let proxy = app.state::<ProxyState>();
    proxy.set_active(port, worktree_id);

    Ok(serde_json::json!({
        "switched": true,
        "project_name": project.name,
        "branch": worktree.branch_name,
        "target_port": port,
        "message": format!(":3000 now routes to {} ({}) on port {}", project.name, worktree.branch_name, port)
    }))
}

/// Returns proxy health status.
pub fn get_proxy_status(app: &AppHandle) -> Result<Value, String> {
    let proxy = app.state::<ProxyState>();
    let running = proxy.proxy_running.load(Ordering::Relaxed);
    let active_port = proxy.get_active_port();

    Ok(serde_json::json!({
        "running": running > 0,
        "proxy_port": if running > 0 { Some(running) } else { None },
        "active_target_port": if active_port > 0 { Some(active_port) } else { None },
    }))
}
