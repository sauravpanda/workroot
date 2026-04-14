use crate::db::queries;
use crate::db::AppDb;
use rusqlite::params;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use tauri::State;

use super::detect;
use super::lifecycle::{self, RestartPolicy};
use super::port;

#[derive(Debug, Serialize)]
pub struct ProcessStatus {
    pub id: i64,
    pub pid: Option<i64>,
    pub command: String,
    pub status: String,
    pub port: Option<i64>,
    pub started_at: Option<String>,
    pub stopped_at: Option<String>,
}

/// Spawns a dev server process for a worktree.
#[tauri::command]
pub async fn spawn_process(
    app_handle: tauri::AppHandle,
    db: State<'_, AppDb>,
    worktree_id: i64,
    profile_id: Option<i64>,
    command_override: Option<String>,
    restart_policy: Option<RestartPolicy>,
) -> Result<ProcessStatus, String> {
    // Gather data from DB
    let (worktree, project, env_vars, used_ports) = {
        let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

        let worktree = queries::get_worktree(&conn, worktree_id)
            .map_err(|e| format!("DB error: {}", e))?
            .ok_or("Worktree not found")?;

        let project = queries::get_project(&conn, worktree.project_id)
            .map_err(|e| format!("DB error: {}", e))?
            .ok_or("Project not found")?;

        let env_vars = if let Some(pid) = profile_id {
            queries::list_env_vars_with_values(&conn, pid)
                .map_err(|e| format!("DB error: {}", e))?
        } else {
            Vec::new()
        };

        // Get ports in use by running processes (single query instead of N+1)
        let used: Vec<u16> = conn
            .prepare(
                "SELECT DISTINCT p.port FROM processes p \
                 JOIN worktrees w ON p.worktree_id = w.id \
                 WHERE w.project_id = ?1 AND p.status = 'running' AND p.port IS NOT NULL",
            )
            .and_then(|mut stmt| {
                stmt.query_map(params![worktree.project_id], |row| {
                    row.get::<_, i64>(0).map(|p| p as u16)
                })
                .and_then(|rows| rows.collect())
            })
            .map_err(|e| format!("DB error: {}", e))?;

        (worktree, project, env_vars, used)
    };

    // Detect framework for default command
    let wt_path = Path::new(&worktree.path);
    let project_path = Path::new(&project.local_path);

    let framework = detect::detect_framework(if wt_path.exists() {
        wt_path
    } else {
        project_path
    });

    let command = command_override.unwrap_or_else(|| {
        framework
            .as_ref()
            .map(|f| f.dev_command.clone())
            .unwrap_or_else(|| "npm run dev".into())
    });

    // Allocate port
    let port = port::allocate_port(&used_ports).ok_or("No available ports in range 3001-3999")?;

    // Build environment
    let mut env: HashMap<String, String> = HashMap::new();
    env.insert("PORT".into(), port.to_string());

    for var in &env_vars {
        if let Some(ref encrypted) = var.encrypted_value {
            let value = super::super::vault::crypto::decrypt(encrypted)?;
            env.insert(var.key.clone(), value);
        }
    }

    // Parse command into program + args
    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Err("Empty command".into());
    }

    let cwd = if wt_path.exists() {
        wt_path
    } else {
        project_path
    };

    // Spawn the process
    let child = tokio::process::Command::new(parts[0])
        .args(&parts[1..])
        .current_dir(cwd)
        .envs(&env)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let pid = child.id().map(|id| id as i64);

    // Record in DB
    let process_id = {
        let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
        let proc_id = queries::insert_process(&conn, worktree_id, &command)
            .map_err(|e| format!("DB error: {}", e))?;
        queries::update_process_started(&conn, proc_id, pid, port as i64)
            .map_err(|e| format!("DB error: {}", e))?;
        proc_id
    };

    // Start lifecycle monitor — captures logs, handles crash detection and auto-restart
    let policy = restart_policy.unwrap_or(RestartPolicy::OnCrash);
    lifecycle::monitor_process(app_handle, process_id, child, policy);

    Ok(ProcessStatus {
        id: process_id,
        pid,
        command,
        status: "running".into(),
        port: Some(port as i64),
        started_at: Some(chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()),
        stopped_at: None,
    })
}

/// Stops a running process by sending SIGTERM, waiting, then SIGKILL.
#[tauri::command]
pub async fn stop_process(db: State<'_, AppDb>, process_id: i64) -> Result<bool, String> {
    let pid = {
        let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
        let proc = queries::get_process(&conn, process_id)
            .map_err(|e| format!("DB error: {}", e))?
            .ok_or("Process not found")?;

        if proc.status != "running" {
            return Err("Process is not running".into());
        }

        proc.pid.ok_or("Process has no PID")?
    };

    // Send SIGTERM
    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;

        let nix_pid = Pid::from_raw(pid as i32);
        let _ = kill(nix_pid, Signal::SIGTERM);

        // Wait up to 5 seconds
        for _ in 0..50 {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            if kill(nix_pid, None).is_err() {
                break; // Process has exited
            }
        }

        // Force kill if still alive
        if kill(nix_pid, None).is_ok() {
            let _ = kill(nix_pid, Signal::SIGKILL);
        }
    }

    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output();
    }

    // Update DB
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::update_process_stopped(&conn, process_id).map_err(|e| format!("DB error: {}", e))?;

    Ok(true)
}

/// Gets the status of a process.
#[tauri::command]
pub fn get_process_status(db: State<'_, AppDb>, process_id: i64) -> Result<ProcessStatus, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let proc = queries::get_process(&conn, process_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Process not found")?;

    Ok(ProcessStatus {
        id: proc.id,
        pid: proc.pid,
        command: proc.command,
        status: proc.status,
        port: proc.port,
        started_at: proc.started_at,
        stopped_at: proc.stopped_at,
    })
}
