use crate::db::{queries, AppDb};
use git2::Repository;
use serde::Serialize;
use tauri::State;

const COMMON_HOOKS: &[&str] = &[
    "pre-commit",
    "commit-msg",
    "pre-push",
    "post-merge",
    "post-checkout",
    "prepare-commit-msg",
    "pre-rebase",
];

#[derive(Debug, Serialize)]
pub struct GitHook {
    pub name: String,
    pub exists: bool,
    pub enabled: bool,
    pub content: Option<String>,
}

/// List all common git hooks and their status.
#[tauri::command]
pub fn list_hooks(db: State<'_, AppDb>, worktree_id: i64) -> Result<Vec<GitHook>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let hooks_dir = repo.path().join("hooks");

    let mut hooks = Vec::new();
    for hook_name in COMMON_HOOKS {
        let hook_path = hooks_dir.join(hook_name);
        let exists = hook_path.exists();
        let enabled = if exists {
            is_executable(&hook_path)
        } else {
            false
        };

        hooks.push(GitHook {
            name: hook_name.to_string(),
            exists,
            enabled,
            content: None,
        });
    }

    Ok(hooks)
}

/// Get the content of a specific hook.
#[tauri::command]
pub fn get_hook_content(
    db: State<'_, AppDb>,
    worktree_id: i64,
    hook_name: String,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let hook_path = repo.path().join("hooks").join(&hook_name);

    std::fs::read_to_string(&hook_path).map_err(|e| format!("Read hook: {}", e))
}

/// Set the content of a hook file.
#[tauri::command]
pub fn set_hook_content(
    db: State<'_, AppDb>,
    worktree_id: i64,
    hook_name: String,
    content: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let hooks_dir = repo.path().join("hooks");

    // Ensure hooks directory exists
    std::fs::create_dir_all(&hooks_dir).map_err(|e| format!("Create hooks dir: {}", e))?;

    let hook_path = hooks_dir.join(&hook_name);
    std::fs::write(&hook_path, &content).map_err(|e| format!("Write hook: {}", e))?;

    // Make executable by default
    set_executable(&hook_path, true)?;

    Ok(())
}

/// Toggle a hook's enabled state (executable permission).
#[tauri::command]
pub fn toggle_hook(
    db: State<'_, AppDb>,
    worktree_id: i64,
    hook_name: String,
    enabled: bool,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let hook_path = repo.path().join("hooks").join(&hook_name);

    if !hook_path.exists() {
        return Err(format!("Hook '{}' does not exist", hook_name));
    }

    set_executable(&hook_path, enabled)
}

#[cfg(unix)]
fn is_executable(path: &std::path::Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(_path: &std::path::Path) -> bool {
    // On Windows, all files are "executable"
    true
}

#[cfg(unix)]
fn set_executable(path: &std::path::Path, enabled: bool) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let metadata = std::fs::metadata(path).map_err(|e| format!("Metadata: {}", e))?;
    let mut perms = metadata.permissions();
    let mode = if enabled {
        perms.mode() | 0o111
    } else {
        perms.mode() & !0o111
    };
    perms.set_mode(mode);
    std::fs::set_permissions(path, perms).map_err(|e| format!("Set permissions: {}", e))
}

#[cfg(not(unix))]
fn set_executable(_path: &std::path::Path, _enabled: bool) -> Result<(), String> {
    Ok(())
}
