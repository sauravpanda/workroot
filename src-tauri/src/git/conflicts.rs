use crate::db::{queries, AppDb};
use git2::Repository;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct ConflictedFile {
    pub path: String,
    pub ancestor_exists: bool,
    pub ours_exists: bool,
    pub theirs_exists: bool,
}

/// Get all conflicted files in the worktree.
#[tauri::command]
pub fn get_conflicted_files(
    db: State<'_, AppDb>,
    worktree_id: i64,
) -> Result<Vec<ConflictedFile>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let index = repo.index().map_err(|e| format!("Index: {}", e))?;

    let conflicts = index.conflicts().map_err(|e| format!("Conflicts: {}", e))?;

    let mut result = Vec::new();
    for conflict_result in conflicts {
        let conflict = conflict_result.map_err(|e| format!("Conflict entry: {}", e))?;

        // Extract path from whichever side is available
        let path = conflict
            .our
            .as_ref()
            .or(conflict.their.as_ref())
            .or(conflict.ancestor.as_ref())
            .and_then(|entry| std::str::from_utf8(&entry.path).ok().map(|s| s.to_string()))
            .unwrap_or_default();

        result.push(ConflictedFile {
            path,
            ancestor_exists: conflict.ancestor.is_some(),
            ours_exists: conflict.our.is_some(),
            theirs_exists: conflict.their.is_some(),
        });
    }

    Ok(result)
}
