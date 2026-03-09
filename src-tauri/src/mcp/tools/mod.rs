pub mod env;
pub mod projects;

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
