pub mod claudemd;
pub mod db;
pub mod dbconnect;
pub mod git;
pub mod github;
pub mod mcp;
pub mod memory;
pub mod process;
pub mod projects;
pub mod proxy;
pub mod shell;
pub mod tray;
pub mod vault;

use claudemd::watcher::ClaudeMdWatcher;
use db::init_db;
use dbconnect::schema::SchemaCache;
use github::auth;
use github::{DeviceCodeResponse, GitHubUser};
use process::lifecycle::ProcessRegistry;
use proxy::ProxyState;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Workroot.", name)
}

#[tauri::command]
async fn github_start_device_flow() -> Result<DeviceCodeResponse, String> {
    auth::start_device_flow().await
}

#[tauri::command]
async fn github_poll_for_token(device_code: String, interval: u64) -> Result<String, String> {
    let token = auth::poll_for_token(&device_code, interval).await?;
    auth::store_token(&token)?;
    Ok("authenticated".into())
}

#[tauri::command]
async fn github_get_user() -> Result<Option<GitHubUser>, String> {
    auth::get_authenticated_user().await
}

#[tauri::command]
fn github_check_auth() -> Result<bool, String> {
    Ok(auth::get_token()?.is_some())
}

#[tauri::command]
fn github_logout() -> Result<(), String> {
    auth::delete_token()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            github_start_device_flow,
            github_poll_for_token,
            github_get_user,
            github_check_auth,
            github_logout,
            projects::register_project,
            projects::list_projects,
            projects::remove_project,
            projects::list_github_repos,
            projects::clone_and_register,
            projects::register_local_project,
            git::worktree::create_worktree,
            git::worktree::list_project_worktrees,
            git::worktree::delete_worktree,
            git::worktree::get_worktree_status,
            git::branch::list_branches,
            git::branch::create_branch,
            vault::vault_store_env_var,
            vault::vault_update_env_var,
            vault::vault_get_env_vars,
            vault::vault_delete_env_var,
            vault::vault_create_profile,
            vault::vault_list_profiles,
            vault::vault_delete_profile,
            vault::vault_duplicate_profile,
            vault::import::parse_env_file,
            vault::import::import_env_vars,
            process::detect::detect_project_framework,
            vault::synthesis::synthesize_env_file,
            vault::synthesis::remove_env_file,
            process::spawn::spawn_process,
            process::spawn::stop_process,
            process::spawn::get_process_status,
            process::logs::get_process_logs,
            process::logs::search_process_logs,
            process::logs::clear_process_logs,
            process::lifecycle::cleanup_worktree_processes,
            proxy::server::get_proxy_status,
            proxy::server::set_proxy_target,
            proxy::server::clear_proxy_target,
            proxy::switch::set_active_project,
            proxy::switch::get_active_project,
            proxy::switch::clear_active_project,
            claudemd::generate_worktree_claude_md,
            shell::install_shell_hook,
            shell::uninstall_shell_hook,
            shell::get_shell_history,
            shell::search_shell_history,
            memory::add_memory_note,
            memory::get_memory_notes,
            memory::search_memory_notes,
            memory::delete_memory_note,
            memory::update_memory_note,
            memory::add_dead_end,
            memory::get_dead_ends,
            memory::search_dead_ends,
            dbconnect::detect::detect_worktree_database,
            dbconnect::schema::get_db_schema,
            dbconnect::schema::refresh_db_schema,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let db = init_db(&app_handle)?;
            app.manage(db);
            app.manage(ProcessRegistry::new());
            app.manage(ProxyState::new());
            app.manage(ClaudeMdWatcher::new());
            app.manage(SchemaCache::new());

            // Start CLAUDE.md watcher loop
            let watcher_handle = app.handle().clone();
            claudemd::watcher::start_watcher_loop(watcher_handle);

            // Start the reverse proxy on port 3000
            let proxy_handle = app.handle().clone();
            tokio::spawn(async move {
                proxy::server::start_proxy(proxy_handle).await;
            });

            // Start the MCP server on port 4444
            let mcp_handle = app.handle().clone();
            let mcp_data_dir = app
                .handle()
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            tokio::spawn(async move {
                mcp::server::start_mcp_server(mcp_handle, mcp_data_dir).await;
            });

            tray::setup_tray(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide the window instead of closing the app so the tray keeps it alive
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Workroot");
}
