use crate::db::queries;
use crate::db::AppDb;
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// Returns all running dev server processes.
pub fn get_running_projects(app: &AppHandle) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let projects = queries::list_projects(&conn).map_err(|e| format!("DB error: {}", e))?;

    let mut results = Vec::new();

    for project in &projects {
        let worktrees =
            queries::list_worktrees(&conn, project.id).map_err(|e| format!("DB error: {}", e))?;

        for wt in &worktrees {
            let processes =
                queries::list_processes(&conn, wt.id).map_err(|e| format!("DB error: {}", e))?;

            for proc in &processes {
                if proc.status == "running" {
                    results.push(serde_json::json!({
                        "process_id": proc.id,
                        "project_name": project.name,
                        "project_id": project.id,
                        "worktree_id": wt.id,
                        "branch": wt.branch_name,
                        "command": proc.command,
                        "port": proc.port,
                        "pid": proc.pid,
                        "status": proc.status,
                        "started_at": proc.started_at,
                    }));
                }
            }
        }
    }

    Ok(serde_json::json!({ "projects": results }))
}

/// Returns detailed info about a specific project.
pub fn get_project_info(app: &AppHandle, project_id: i64) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let project = queries::get_project(&conn, project_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found")?;

    let worktrees =
        queries::list_worktrees(&conn, project_id).map_err(|e| format!("DB error: {}", e))?;

    let wt_info: Vec<Value> = worktrees
        .iter()
        .map(|wt| {
            let processes = queries::list_processes(&conn, wt.id).unwrap_or_default();
            let running = processes.iter().find(|p| p.status == "running");

            serde_json::json!({
                "id": wt.id,
                "branch": wt.branch_name,
                "path": wt.path,
                "status": wt.status,
                "port": running.and_then(|p| p.port),
                "process_status": running.map(|p| &p.status),
            })
        })
        .collect();

    let profiles =
        queries::list_env_profiles(&conn, project_id).map_err(|e| format!("DB error: {}", e))?;

    Ok(serde_json::json!({
        "id": project.id,
        "name": project.name,
        "local_path": project.local_path,
        "github_url": project.github_url,
        "framework": project.framework,
        "worktrees": wt_info,
        "env_profiles": profiles.iter().map(|p| serde_json::json!({
            "id": p.id,
            "name": p.name,
            "is_active": p.is_active,
        })).collect::<Vec<_>>(),
    }))
}
