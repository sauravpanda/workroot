pub mod agents;
pub mod ai;
pub mod backup;
pub mod bookmarks;
pub mod browser;
pub mod claudemd;
pub mod clipboard;
pub mod collaboration;
pub mod db;
pub mod dbconnect;
pub mod deps;
pub mod docker;
pub mod errors;
pub mod fileview;
pub mod filewatcher;
pub mod git;
pub mod github;
pub mod mcp;
pub mod memory;
pub mod metrics;
pub mod network;
pub mod perf;
pub mod plugins;
pub mod process;
pub mod projects;
pub mod proxy;
pub mod scheduler;
pub mod search;
pub mod security;
pub mod settings;
pub mod shell;
pub mod snippets;
pub mod ssh;
pub mod tasks;
pub mod terminal;
pub mod testing;
pub mod todos;
pub mod tray;
pub mod validate;
pub mod vault;
pub mod webhooks;
pub mod workspace;

use claudemd::watcher::ClaudeMdWatcher;
use db::{init_db, AppDb};
use dbconnect::schema::SchemaCache;
use filewatcher::tracker::FileWatcherRegistry;
use github::auth;
use github::{DeviceCodeResponse, GitHubUser};
use process::lifecycle::ProcessRegistry;
use proxy::ProxyState;

/// Shared reqwest HTTP client — reuse across all requests to benefit from
/// connection pooling, DNS caching, and reduced allocations.
pub struct HttpClient(pub reqwest::Client);

impl HttpClient {
    pub fn new() -> Self {
        Self(
            reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        )
    }
}

impl Default for HttpClient {
    fn default() -> Self {
        Self::new()
    }
}
use tasks::watch::WatchState;
use tauri::{Manager, State};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Workroot.", name)
}

#[tauri::command]
async fn github_start_device_flow(db: State<'_, AppDb>) -> Result<DeviceCodeResponse, String> {
    auth::start_device_flow(db).await
}

#[tauri::command]
async fn github_poll_for_token(
    db: State<'_, AppDb>,
    device_code: String,
    interval: u64,
) -> Result<String, String> {
    let token = auth::poll_for_token(db, &device_code, interval).await?;
    auth::store_token(&token)?;
    Ok("authenticated".into())
}

#[tauri::command]
async fn github_get_user() -> Result<Option<GitHubUser>, String> {
    auth::get_authenticated_user().await
}

#[tauri::command]
fn github_check_auth() -> Result<bool, String> {
    Ok(auth::get_token_from_env_or_gh()?.is_some())
}

#[tauri::command]
fn github_logout() -> Result<(), String> {
    auth::delete_token()
}

#[tauri::command]
fn github_store_pat(token: String) -> Result<(), String> {
    auth::store_pat(&token)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            github_start_device_flow,
            github_poll_for_token,
            github_get_user,
            github_check_auth,
            github_logout,
            github_store_pat,
            projects::register_project,
            projects::list_projects,
            projects::remove_project,
            projects::list_github_repos,
            projects::clone_and_register,
            projects::register_local_project,
            git::worktree::create_worktree,
            git::worktree::list_project_worktrees,
            git::worktree::list_worktree_history,
            git::worktree::delete_worktree,
            git::worktree::hide_worktree,
            git::worktree::unhide_worktree,
            git::worktree::list_hidden_worktrees,
            git::worktree::get_worktree_delete_warnings,
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
            vault::share::export_profile_to_gist,
            vault::share::import_profile_from_gist,
            vault::share::list_shared_gists,
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
            claudemd::read_worktree_claude_md,
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
            git::diff::get_changed_files,
            git::diff::get_file_diff,
            git::diff::stage_files,
            git::diff::unstage_files,
            git::commit::git_commit,
            git::commit::git_push,
            git::commit::get_push_status,
            github::pr::create_pull_request,
            github::pr::get_pr_for_branch,
            github::pr::get_pr_template,
            github::pr::get_default_branch,
            github::pr::merge_pull_request,
            github::ci::get_pr_status,
            github::activity::list_repo_pulls,
            github::activity::list_repo_issues,
            github::activity::get_repo_activity,
            network::get_network_traffic,
            network::search_network_traffic,
            network::get_failed_requests,
            network::clear_network_traffic,
            browser::correlate::get_browser_events,
            browser::correlate::get_correlated_event,
            settings::get_setting,
            settings::get_terminal_settings,
            settings::set_setting,
            settings::get_all_settings,
            settings::delete_setting,
            tasks::discover::discover_tasks,
            tasks::deps::get_task_deps,
            tasks::history::record_task_run,
            tasks::history::get_task_history,
            tasks::history::compare_task_runs,
            bookmarks::create_bookmark,
            bookmarks::list_bookmarks,
            bookmarks::update_bookmark,
            bookmarks::delete_bookmark,
            git::stash::list_stashes,
            git::stash::create_stash,
            git::stash::apply_stash,
            git::stash::pop_stash,
            git::stash::drop_stash,
            git::checkpoint::create_checkpoint,
            git::checkpoint::list_checkpoints,
            git::checkpoint::rollback_to_checkpoint,
            git::checkpoint::delete_checkpoint,
            git::blame::blame_file,
            git::compare::compare_branches,
            git::hooks::list_hooks,
            git::hooks::get_hook_content,
            git::hooks::set_hook_content,
            git::hooks::toggle_hook,
            git::conflicts::get_conflicted_files,
            security::audit::audit_dependencies,
            security::secrets::scan_for_secrets,
            security::licenses::check_licenses,
            security::headers::check_security_headers,
            testing::detect::detect_test_frameworks,
            testing::runner::run_tests,
            testing::coverage::parse_coverage,
            testing::benchmarks::record_benchmark,
            testing::benchmarks::list_benchmark_metrics,
            testing::benchmarks::get_benchmark_history,
            docker::detect::detect_docker,
            docker::detect::list_containers,
            docker::compose::list_compose_services,
            docker::images::list_docker_images,
            docker::images::remove_docker_image,
            docker::images::prune_docker_images,
            docker::monitor::get_container_stats,
            docker::monitor::get_container_logs,
            docker::monitor::container_action,
            testing::flaky::record_test_result,
            testing::flaky::get_flaky_tests,
            tasks::watch::start_watch_task,
            tasks::watch::stop_watch_task,
            tasks::watch::get_watched_tasks,
            collaboration::notifications::get_notifications,
            collaboration::notifications::mark_notification_read,
            collaboration::timeline::record_activity,
            collaboration::timeline::get_activity_timeline,
            plugins::registry::list_plugins,
            plugins::registry::toggle_plugin,
            ai::chat::ai_chat_send,
            ai::chat::ai_chat_list_models,
            ai::chat::ai_check_health,
            ai::assist::ai_generate_commit_message,
            ai::assist::ai_generate_pr_description,
            ai::assist::ai_diagnose_error,
            ai::assist::ai_explain_code,
            search::unified_search,
            backup::export_backup,
            backup::import_backup,
            backup::list_backups,
            terminal::recording::start_recording,
            terminal::recording::add_recording_event,
            terminal::recording::stop_recording,
            terminal::recording::list_recordings,
            terminal::recording::get_recording_events,
            terminal::recording::delete_recording,
            terminal::drop_image::save_dropped_image,
            metrics::dora::record_deployment,
            metrics::dora::get_dora_metrics,
            metrics::dora::list_deployments,
            webhooks::get_webhook_events,
            webhooks::clear_webhook_events,
            webhooks::get_webhook_config,
            ssh::connections::list_ssh_connections,
            ssh::connections::create_ssh_connection,
            ssh::connections::update_ssh_connection,
            ssh::connections::save_ssh_connection,
            ssh::connections::delete_ssh_connection,
            ssh::connections::build_ssh_command,
            ssh::connections::test_ssh_connection,
            perf::monitor::get_app_metrics,
            git::analytics::get_git_analytics,
            snippets::create_snippet,
            snippets::list_snippets,
            snippets::search_snippets,
            snippets::update_snippet,
            snippets::delete_snippet,
            vault::diff::compare_env_profiles,
            perf::vitals::run_lighthouse_audit,
            perf::vitals::record_vitals,
            perf::vitals::get_vitals_history,
            perf::vitals::clear_vitals_history,
            plugins::runtime::discover_plugins,
            plugins::runtime::execute_plugin,
            plugins::runtime::install_plugin_from_url,
            deps::analyze::analyze_dependencies,
            network::ports::scan_local_ports,
            filewatcher::stats::get_directory_stats,
            git::tags::list_tags,
            git::tags::create_tag,
            git::tags::delete_tag,
            git::log::get_git_log,
            git::log::get_commit_detail,
            git::log::search_git_log,
            workspace::save_workspace,
            workspace::list_workspaces,
            workspace::load_workspace,
            workspace::delete_workspace,
            scheduler::create_scheduled_task,
            scheduler::list_scheduled_tasks,
            scheduler::toggle_scheduled_task,
            scheduler::delete_scheduled_task,
            scheduler::update_task_last_run,
            clipboard::add_clipboard_entry,
            clipboard::list_clipboard_entries,
            clipboard::search_clipboard,
            clipboard::clear_clipboard_history,
            todos::create_todo,
            todos::list_todos,
            todos::update_todo,
            todos::delete_todo,
            fileview::list_dir,
            fileview::get_worktree_file_statuses,
            fileview::read_file_content,
            fileview::open_file_in_editor,
            agents::pipeline::create_agent,
            agents::pipeline::list_agents,
            agents::pipeline::delete_agent,
            agents::pipeline::create_pipeline,
            agents::pipeline::list_pipelines,
            agents::pipeline::delete_pipeline,
            agents::pipeline::list_pipeline_runs,
            agents::pipeline::get_pipeline_run,
            agents::pipeline::run_pipeline,
            agents::pipeline::run_agent_task,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let db = init_db(&app_handle)?;
            app.manage(db);
            app.manage(ProcessRegistry::new());
            app.manage(HttpClient::new());
            app.manage(ProxyState::new());
            app.manage(ClaudeMdWatcher::new());
            app.manage(SchemaCache::new());
            app.manage(FileWatcherRegistry::new());
            app.manage(WatchState::new());

            // Start CLAUDE.md watcher loop
            let watcher_handle = app.handle().clone();
            claudemd::watcher::start_watcher_loop(watcher_handle);

            // Start the reverse proxy on port 3000
            let proxy_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                eprintln!("[startup] Starting reverse proxy on port 3000...");
                proxy::server::start_proxy(proxy_handle).await;
                eprintln!("[startup] Reverse proxy exited unexpectedly");
            });

            // Start the HTTP forward proxy on port 8888
            let fwd_proxy_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                eprintln!("[startup] Starting forward proxy on port 8888...");
                network::proxy::start_forward_proxy(fwd_proxy_handle).await;
                eprintln!("[startup] Forward proxy exited unexpectedly");
            });

            // Start the MCP server on port 4444
            let mcp_handle = app.handle().clone();
            let mcp_data_dir = app
                .handle()
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            tauri::async_runtime::spawn(async move {
                eprintln!("[startup] Starting MCP server on port 4444...");
                mcp::server::start_mcp_server(mcp_handle, mcp_data_dir).await;
                eprintln!("[startup] MCP server exited unexpectedly");
            });

            // Start the webhook receiver on port 9999
            let webhook_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                eprintln!("[startup] Starting webhook server on port 9999...");
                webhooks::start_webhook_server(webhook_handle).await;
                eprintln!("[startup] Webhook server exited unexpectedly");
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
