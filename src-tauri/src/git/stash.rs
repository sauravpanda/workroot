use crate::db::{queries, AppDb};
use git2::{Repository, StashFlags};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
}

/// List all stash entries for a worktree.
#[tauri::command]
pub fn list_stashes(db: State<'_, AppDb>, worktree_id: i64) -> Result<Vec<StashEntry>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let mut repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let mut entries = Vec::new();

    repo.stash_foreach(|index, message, _| {
        entries.push(StashEntry {
            index,
            message: message.to_string(),
        });
        true
    })
    .map_err(|e| format!("Stash: {}", e))?;

    Ok(entries)
}

/// Create a new stash entry.
#[tauri::command]
pub fn create_stash(
    db: State<'_, AppDb>,
    worktree_id: i64,
    message: String,
    include_untracked: bool,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let mut repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let sig = repo.signature().map_err(|e| format!("Signature: {}", e))?;
    let flags = if include_untracked {
        StashFlags::INCLUDE_UNTRACKED
    } else {
        StashFlags::DEFAULT
    };

    repo.stash_save(&sig, &message, Some(flags))
        .map_err(|e| format!("Stash: {}", e))?;

    Ok(())
}

/// Apply a stash entry without removing it.
#[tauri::command]
pub fn apply_stash(db: State<'_, AppDb>, worktree_id: i64, index: usize) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let mut repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    repo.stash_apply(index, None)
        .map_err(|e| format!("Stash apply: {}", e))?;

    Ok(())
}

/// Pop a stash entry (apply and remove).
#[tauri::command]
pub fn pop_stash(db: State<'_, AppDb>, worktree_id: i64, index: usize) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let mut repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    repo.stash_pop(index, None)
        .map_err(|e| format!("Stash pop: {}", e))?;

    Ok(())
}

/// Drop (delete) a stash entry.
#[tauri::command]
pub fn drop_stash(db: State<'_, AppDb>, worktree_id: i64, index: usize) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let mut repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    repo.stash_drop(index)
        .map_err(|e| format!("Stash drop: {}", e))?;

    Ok(())
}
