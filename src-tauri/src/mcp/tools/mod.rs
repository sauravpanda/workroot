pub mod env;
pub mod logs;
pub mod projects;
pub mod proxy;
pub mod shell;

use serde_json::Value;
use tauri::AppHandle;

/// Dispatches a JSON-RPC method call to the appropriate tool handler.
pub fn dispatch(app: &AppHandle, method: &str, params: Option<Value>) -> Result<Value, String> {
    match method {
        "get_running_projects" => projects::get_running_projects(app),
        "get_project_info" => {
            let project_id = extract_i64(&params, "project_id")?;
            projects::get_project_info(app, project_id)
        }
        "get_env_vars" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            env::get_env_vars(app, worktree_id)
        }
        "get_env_var_value" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            let key = extract_string(&params, "key")?;
            env::get_env_var_value(app, worktree_id, &key)
        }
        "get_recent_logs" => {
            let process_id = extract_i64(&params, "process_id")?;
            let lines = params
                .as_ref()
                .and_then(|p| p.get("lines"))
                .and_then(|v| v.as_i64());
            let stream = params
                .as_ref()
                .and_then(|p| p.get("stream"))
                .and_then(|v| v.as_str());
            logs::get_recent_logs(app, process_id, lines, stream)
        }
        "search_logs" => {
            let process_id = extract_i64(&params, "process_id")?;
            let query = extract_string(&params, "query")?;
            logs::search_logs(app, process_id, &query)
        }
        "get_error_logs" => {
            let process_id = extract_i64(&params, "process_id")?;
            let lines = params
                .as_ref()
                .and_then(|p| p.get("lines"))
                .and_then(|v| v.as_i64());
            logs::get_error_logs(app, process_id, lines)
        }
        "get_active_proxy" => proxy::get_active_proxy(app),
        "switch_active_proxy" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            proxy::switch_active_proxy(app, worktree_id)
        }
        "get_proxy_status" => proxy::get_proxy_status(app),
        "get_shell_history" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            let limit = params
                .as_ref()
                .and_then(|p| p.get("limit"))
                .and_then(|v| v.as_i64());
            shell::get_shell_history(app, worktree_id, limit)
        }
        "search_shell_history" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            let query = extract_string(&params, "query")?;
            shell::search_shell_history(app, worktree_id, &query)
        }
        _ => Err(format!("Method not found: {}", method)),
    }
}

fn extract_i64(params: &Option<Value>, key: &str) -> Result<i64, String> {
    params
        .as_ref()
        .and_then(|p| p.get(key))
        .and_then(|v| v.as_i64())
        .ok_or_else(|| format!("Missing required parameter: {}", key))
}

fn extract_string(params: &Option<Value>, key: &str) -> Result<String, String> {
    params
        .as_ref()
        .and_then(|p| p.get(key))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing required parameter: {}", key))
}
