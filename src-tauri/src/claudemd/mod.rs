pub mod template;
pub mod watcher;

use crate::db::AppDb;
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
