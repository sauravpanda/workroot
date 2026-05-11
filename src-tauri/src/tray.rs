use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};

/// Wrapper so we can `app.manage()` the tray handle and update its
/// title/tooltip from a Tauri command. The constant id ("main") lets
/// us look it up later via `app.tray_by_id` as a fallback, but holding
/// the handle directly is more reliable.
pub struct TrayHandle(pub TrayIcon);

/// Sets up the system tray icon with a context menu.
///
/// Menu items:
/// - "Show Workroot" — brings the main window to front
/// - separator
/// - "Quit" — exits the application
///
/// Left-clicking the tray icon also shows the main window.
pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_i = MenuItem::with_id(app, "show", "Show Workroot", true, None::<&str>)?;
    let separator = MenuItem::with_id(app, "sep", "---", false, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &separator, &quit_i])?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Workroot")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                show_main_window(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(TrayHandle(tray));
    Ok(())
}

/// Update the tray badge from the frontend's fleet snapshot.
/// `needs_you` is the number of agents in `waiting_input` state.
///
/// macOS shows the title text next to the tray icon — natural badge.
/// Linux/Windows update the tooltip only (no inline badge support).
#[tauri::command]
pub fn update_tray_badge(needs_you: u32, tray: State<'_, TrayHandle>) -> Result<(), String> {
    let title = if needs_you > 0 {
        Some(format!("{needs_you}"))
    } else {
        None
    };
    let tooltip = if needs_you > 0 {
        format!(
            "Workroot — {needs_you} agent{} need you",
            if needs_you == 1 { "" } else { "s" }
        )
    } else {
        "Workroot".to_string()
    };
    tray.0
        .set_title(title)
        .map_err(|e| format!("set_title failed: {e}"))?;
    tray.0
        .set_tooltip(Some(&tooltip))
        .map_err(|e| format!("set_tooltip failed: {e}"))?;
    Ok(())
}

/// Shows the main window, unminimizing and focusing it.
/// If the window doesn't exist yet, this is a no-op.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
