pub mod db;
pub mod tray;

use db::init_db;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Workroot.", name)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
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
