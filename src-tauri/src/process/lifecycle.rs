use crate::db::queries;
use crate::db::AppDb;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Global registry of running process PIDs for cleanup on app exit.
pub struct ProcessRegistry {
    /// Maps process_id (DB) -> OS pid
    pub pids: Mutex<HashMap<i64, u32>>,
}

impl Default for ProcessRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessRegistry {
    pub fn new() -> Self {
        Self {
            pids: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, process_id: i64, pid: u32) {
        if let Ok(mut pids) = self.pids.lock() {
            pids.insert(process_id, pid);
        }
    }

    pub fn unregister(&self, process_id: i64) {
        if let Ok(mut pids) = self.pids.lock() {
            pids.remove(&process_id);
        }
    }

    pub fn all_pids(&self) -> Vec<(i64, u32)> {
        self.pids
            .lock()
            .map(|pids| pids.iter().map(|(&k, &v)| (k, v)).collect())
            .unwrap_or_default()
    }
}

/// Restart policy for a process.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RestartPolicy {
    Never,
    Always,
    OnCrash,
}

/// Events emitted when process state changes.
#[derive(Debug, Clone, Serialize)]
pub struct ProcessEvent {
    pub process_id: i64,
    pub event: String,
    pub exit_code: Option<i32>,
    pub restart_count: u32,
}

/// Monitors a process after spawn, handling exit detection and auto-restart.
pub fn monitor_process(
    app_handle: AppHandle,
    process_id: i64,
    mut child: tokio::process::Child,
    policy: RestartPolicy,
) {
    // Register PID
    if let Some(pid) = child.id() {
        let registry = app_handle.state::<ProcessRegistry>();
        registry.register(process_id, pid);
    }

    // Take stdout/stderr for log capture before moving child
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Start log capture tasks
    if let Some(out) = stdout {
        let app = app_handle.clone();
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let reader = BufReader::new(out);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                super::logs::store_and_emit(&app, process_id, "stdout", &line);
            }
        });
    }

    if let Some(err) = stderr {
        let app = app_handle.clone();
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let reader = BufReader::new(err);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                super::logs::store_and_emit(&app, process_id, "stderr", &line);
            }
        });
    }

    // Monitor the process exit
    let app = app_handle.clone();
    tokio::spawn(async move {
        let mut restart_count: u32 = 0;
        let max_restarts: u32 = 5;
        let mut current_child = child;

        loop {
            let status = current_child.wait().await;

            // Unregister from registry
            {
                let registry = app.state::<ProcessRegistry>();
                registry.unregister(process_id);
            };

            let exit_code = status.ok().and_then(|s| s.code());
            let is_crash = exit_code.map(|c| c != 0).unwrap_or(true);

            // Update DB status
            let db = app.state::<AppDb>();
            if let Ok(conn) = db.0.lock() {
                if is_crash {
                    let _ = queries::update_process_status(&conn, process_id, "crashed");
                } else {
                    let _ = queries::update_process_stopped(&conn, process_id);
                }
            };

            // Emit event
            let event_name = if is_crash { "crashed" } else { "stopped" };
            let _ = app.emit(
                "process-event",
                ProcessEvent {
                    process_id,
                    event: event_name.to_string(),
                    exit_code,
                    restart_count,
                },
            );

            // Determine if we should restart
            let should_restart = match policy {
                RestartPolicy::Never => false,
                RestartPolicy::Always => true,
                RestartPolicy::OnCrash => is_crash,
            };

            if !should_restart || restart_count >= max_restarts {
                break;
            }

            restart_count += 1;

            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
            let delay_secs = std::cmp::min(1u64 << (restart_count - 1), 30);
            tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;

            // Emit restarting event
            let _ = app.emit(
                "process-event",
                ProcessEvent {
                    process_id,
                    event: "restarting".to_string(),
                    exit_code: None,
                    restart_count,
                },
            );

            // Re-read the process info from DB to get the command
            let process_info = {
                let db = app.state::<AppDb>();
                let result = if let Ok(conn) = db.0.lock() {
                    queries::get_process(&conn, process_id).ok().flatten()
                } else {
                    None
                };
                result
            };

            let proc = match process_info {
                Some(p) => p,
                None => break,
            };

            // Get worktree path for cwd
            let worktree_path = {
                let db = app.state::<AppDb>();
                let result = if let Ok(conn) = db.0.lock() {
                    queries::get_worktree(&conn, proc.worktree_id)
                        .ok()
                        .flatten()
                        .map(|w| w.path)
                } else {
                    None
                };
                result
            };

            let cwd = match worktree_path {
                Some(p) => p,
                None => break,
            };

            // Re-spawn the command
            let parts: Vec<&str> = proc.command.split_whitespace().collect();
            if parts.is_empty() {
                break;
            }

            let mut cmd = tokio::process::Command::new(parts[0]);
            cmd.args(&parts[1..])
                .current_dir(&cwd)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());

            // Inject PORT if we have one
            if let Some(port) = proc.port {
                cmd.env("PORT", port.to_string());
            }

            match cmd.spawn() {
                Ok(mut new_child) => {
                    let new_pid = new_child.id();

                    // Update DB with new PID
                    let db = app.state::<AppDb>();
                    if let Ok(conn) = db.0.lock() {
                        let _ = queries::update_process_status(&conn, process_id, "running");
                        if let Some(pid) = new_pid {
                            let _ = queries::update_process_pid(&conn, process_id, pid as i64);
                        }
                    };

                    // Register new PID
                    if let Some(pid) = new_pid {
                        let registry = app.state::<ProcessRegistry>();
                        registry.register(process_id, pid);
                    }

                    // Capture new stdout/stderr
                    if let Some(out) = new_child.stdout.take() {
                        let app2 = app.clone();
                        tokio::spawn(async move {
                            use tokio::io::{AsyncBufReadExt, BufReader};
                            let reader = BufReader::new(out);
                            let mut lines = reader.lines();
                            while let Ok(Some(line)) = lines.next_line().await {
                                super::logs::store_and_emit(&app2, process_id, "stdout", &line);
                            }
                        });
                    }
                    if let Some(err) = new_child.stderr.take() {
                        let app2 = app.clone();
                        tokio::spawn(async move {
                            use tokio::io::{AsyncBufReadExt, BufReader};
                            let reader = BufReader::new(err);
                            let mut lines = reader.lines();
                            while let Ok(Some(line)) = lines.next_line().await {
                                super::logs::store_and_emit(&app2, process_id, "stderr", &line);
                            }
                        });
                    }

                    let _ = app.emit(
                        "process-event",
                        ProcessEvent {
                            process_id,
                            event: "started".to_string(),
                            exit_code: None,
                            restart_count,
                        },
                    );

                    current_child = new_child;
                }
                Err(_) => break,
            }
        }
    });
}

/// Kills a process by PID using SIGTERM then SIGKILL.
fn kill_process_by_pid(pid: u32) {
    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;

        let nix_pid = Pid::from_raw(pid as i32);
        let _ = kill(nix_pid, Signal::SIGTERM);

        // Brief wait then force kill
        std::thread::sleep(std::time::Duration::from_millis(500));
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
}

/// Stops all processes for a worktree. Called when a worktree is deleted.
#[tauri::command]
pub fn cleanup_worktree_processes(
    db: State<'_, AppDb>,
    registry: State<'_, ProcessRegistry>,
    worktree_id: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let processes =
        queries::list_processes(&conn, worktree_id).map_err(|e| format!("DB error: {}", e))?;

    for proc in &processes {
        if proc.status == "running" || proc.status == "crashed" {
            if let Some(pid) = proc.pid {
                kill_process_by_pid(pid as u32);
                registry.unregister(proc.id);
            }
            let _ = queries::update_process_stopped(&conn, proc.id);
        }
    }

    Ok(())
}

/// Stops all running processes. Called on app shutdown.
pub fn cleanup_all_processes(app: &AppHandle) {
    let registry = app.state::<ProcessRegistry>();
    let db = app.state::<AppDb>();

    let pids = registry.all_pids();

    for (process_id, pid) in &pids {
        kill_process_by_pid(*pid);
        registry.unregister(*process_id);
    }

    // Update DB for all running processes
    if let Ok(conn) = db.0.lock() {
        for (process_id, _) in &pids {
            let _ = queries::update_process_stopped(&conn, *process_id);
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restart_policy_serde() {
        let json = serde_json::to_string(&RestartPolicy::OnCrash).unwrap();
        assert_eq!(json, "\"on_crash\"");

        let parsed: RestartPolicy = serde_json::from_str("\"never\"").unwrap();
        assert_eq!(parsed, RestartPolicy::Never);

        let parsed: RestartPolicy = serde_json::from_str("\"always\"").unwrap();
        assert_eq!(parsed, RestartPolicy::Always);
    }

    #[test]
    fn process_registry_operations() {
        let registry = ProcessRegistry::new();

        registry.register(1, 1234);
        registry.register(2, 5678);

        let pids = registry.all_pids();
        assert_eq!(pids.len(), 2);

        registry.unregister(1);
        let pids = registry.all_pids();
        assert_eq!(pids.len(), 1);
        assert_eq!(pids[0], (2, 5678));
    }
}
