pub mod hook;

use serde::{Deserialize, Serialize};

/// Payload sent by the shell hook scripts.
#[derive(Debug, Deserialize, Serialize)]
pub struct ShellCommand {
    pub command: String,
    pub exit_code: Option<i64>,
    pub cwd: String,
    pub timestamp: Option<String>,
}

#[tauri::command]
pub fn install_shell_hook(shell_type: String) -> Result<String, String> {
    let st = hook::ShellType::parse(&shell_type)
        .ok_or_else(|| format!("Unsupported shell: {}", shell_type))?;
    hook::install_hook(st)
}

#[tauri::command]
pub fn uninstall_shell_hook(shell_type: String) -> Result<(), String> {
    let st = hook::ShellType::parse(&shell_type)
        .ok_or_else(|| format!("Unsupported shell: {}", shell_type))?;
    hook::uninstall_hook(st)
}
