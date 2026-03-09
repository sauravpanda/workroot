pub mod db;
pub mod env;
pub mod files;
pub mod logs;
pub mod memory;
pub mod network;
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
        "get_session_memory" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            memory::get_session_memory(app, worktree_id)
        }
        "search_memory" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            let query = extract_string(&params, "query")?;
            memory::search_memory(app, worktree_id, &query)
        }
        "add_memory" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            let content = extract_string(&params, "content")?;
            let category = extract_string(&params, "category")?;
            memory::add_memory(app, worktree_id, &content, &category)
        }
        "get_decisions" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            memory::get_decisions(app, worktree_id)
        }
        "get_dead_ends" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            memory::get_dead_ends(app, worktree_id)
        }
        "get_db_schema" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            db::get_db_schema(app, worktree_id)
        }
        "get_table_details" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            let table_name = extract_string(&params, "table_name")?;
            db::get_table_details(app, worktree_id, &table_name)
        }
        "get_db_relationships" => {
            let worktree_id = extract_i64(&params, "worktree_id")?;
            db::get_db_relationships(app, worktree_id)
        }
        "get_http_traffic" => {
            let method_filter = params
                .as_ref()
                .and_then(|p| p.get("method"))
                .and_then(|v| v.as_str());
            let url_pattern = params
                .as_ref()
                .and_then(|p| p.get("url_pattern"))
                .and_then(|v| v.as_str());
            let status_min = params
                .as_ref()
                .and_then(|p| p.get("status_min"))
                .and_then(|v| v.as_i64());
            let status_max = params
                .as_ref()
                .and_then(|p| p.get("status_max"))
                .and_then(|v| v.as_i64());
            let limit = params
                .as_ref()
                .and_then(|p| p.get("limit"))
                .and_then(|v| v.as_i64());
            network::get_http_traffic(
                app,
                method_filter,
                url_pattern,
                status_min,
                status_max,
                limit,
            )
        }
        "get_failed_requests" => {
            let limit = params
                .as_ref()
                .and_then(|p| p.get("limit"))
                .and_then(|v| v.as_i64());
            network::get_failed_requests(app, limit)
        }
        "search_traffic" => {
            let url_pattern = extract_string(&params, "url_pattern")?;
            let limit = params
                .as_ref()
                .and_then(|p| p.get("limit"))
                .and_then(|v| v.as_i64());
            network::search_http_traffic(app, &url_pattern, limit)
        }
        "get_file_hotspots" => {
            let project_id = extract_i64(&params, "project_id")?;
            let period = params
                .as_ref()
                .and_then(|p| p.get("period"))
                .and_then(|v| v.as_str());
            files::get_file_hotspots(app, project_id, period)
        }
        "get_related_files" => {
            let project_id = extract_i64(&params, "project_id")?;
            let file_path = extract_string(&params, "file_path")?;
            files::get_related_files(app, project_id, &file_path)
        }
        "get_recent_file_changes" => {
            let project_id = extract_i64(&params, "project_id")?;
            let limit = params
                .as_ref()
                .and_then(|p| p.get("limit"))
                .and_then(|v| v.as_i64());
            files::get_recent_file_changes(app, project_id, limit)
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
