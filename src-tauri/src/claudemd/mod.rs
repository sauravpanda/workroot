pub mod template;
pub mod watcher;

use crate::db::{queries, AppDb};
use std::path::Path;
use tauri::State;

/// Tauri command: generate and write CLAUDE.md for a worktree.
#[tauri::command]
pub fn generate_worktree_claude_md(
    db: State<'_, AppDb>,
    worktree_id: i64,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let content = template::generate_claude_md(&conn, worktree_id)?;
    template::write_claude_md(&conn, worktree_id, &content)?;
    Ok(content)
}

/// Tauri command: read CLAUDE.md content for a worktree (returns empty string if not found).
#[tauri::command]
pub fn read_worktree_claude_md(db: State<'_, AppDb>, worktree_id: i64) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    let claude_path = Path::new(&worktree.path).join("CLAUDE.md");
    if claude_path.exists() {
        std::fs::read_to_string(&claude_path)
            .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
    } else {
        Ok(String::new())
    }
}
