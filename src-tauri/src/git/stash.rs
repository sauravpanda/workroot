use crate::db::queries;
use crate::db::AppDb;
use git2::{Repository, StashFlags};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
}

/// List all stashes for a worktree.
#[tauri::command]
pub fn list_stashes(db: State<'_, AppDb>, worktree_id: i64) -> Result<Vec<StashEntry>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let mut repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    let mut entries: Vec<StashEntry> = Vec::new();
    repo.stash_foreach(|index, message, _oid| {
        entries.push(StashEntry {
            index,
            message: message.to_string(),
        });
        true
    })
    .map_err(|e| format!("Stash list: {}", e))?;

    Ok(entries)
}

/// Create a new stash.
#[tauri::command]
pub fn create_stash(
    db: State<'_, AppDb>,
    worktree_id: i64,
    message: String,
    include_untracked: bool,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let mut repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    let sig = repo.signature().map_err(|e| format!("Signature: {}", e))?;

    let mut flags = StashFlags::DEFAULT;
    if include_untracked {
        flags |= StashFlags::INCLUDE_UNTRACKED;
    }

    let oid = repo
        .stash_save(&sig, &message, Some(flags))
        .map_err(|e| format!("Stash save: {}", e))?;

    Ok(oid.to_string())
}

/// Apply a stash without dropping it.
#[tauri::command]
pub fn apply_stash(
    db: State<'_, AppDb>,
    worktree_id: i64,
    stash_index: usize,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let mut repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    repo.stash_apply(stash_index, None)
        .map_err(|e| format!("Stash apply: {}", e))?;

    Ok(())
}

/// Apply a stash and drop it.
#[tauri::command]
pub fn pop_stash(db: State<'_, AppDb>, worktree_id: i64, stash_index: usize) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let mut repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    repo.stash_pop(stash_index, None)
        .map_err(|e| format!("Stash pop: {}", e))?;

    Ok(())
}

/// Drop a stash without applying it.
#[tauri::command]
pub fn drop_stash(
    db: State<'_, AppDb>,
    worktree_id: i64,
    stash_index: usize,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let mut repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    repo.stash_drop(stash_index)
        .map_err(|e| format!("Stash drop: {}", e))?;

    Ok(())
}
