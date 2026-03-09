pub mod db;
pub mod github;
pub mod projects;
pub mod tray;

use db::init_db;
use github::auth;
use github::{DeviceCodeResponse, GitHubUser};
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
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let db = init_db(&app_handle)?;
            app.manage(db);

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
