use crate::db::{queries, AppDb};
use git2::{Oid, Repository, StashFlags};
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct CheckpointEntry {
    pub id: i64,
    pub label: String,
    pub head_sha: String,
    pub has_stash: bool,
    pub created_at: String,
}

/// Create a checkpoint: record current HEAD SHA and optionally stash dirty changes.
#[tauri::command]
pub fn create_checkpoint(
    db: State<'_, AppDb>,
    worktree_id: i64,
    label: String,
) -> Result<CheckpointEntry, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let mut repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;

    let head_sha = {
        let head = repo.head().map_err(|e| format!("HEAD: {}", e))?;
        head.peel_to_commit()
            .map_err(|e| format!("HEAD commit: {}", e))?
            .id()
            .to_string()
    }; // `head` drops here, releasing the immutable borrow

    // Stash any uncommitted changes (tracked + untracked)
    let is_dirty = {
        let statuses = repo.statuses(None).map_err(|e| format!("Status: {}", e))?;
        statuses.iter().any(|s| {
            let f = s.status();
            f.is_index_modified()
                || f.is_index_new()
                || f.is_index_deleted()
                || f.is_wt_modified()
                || f.is_wt_new()
                || f.is_wt_deleted()
        })
    }; // `statuses` drops here

    let stash_oid = if is_dirty {
        let sig = repo.signature().map_err(|e| format!("Signature: {}", e))?;
        let stash_msg = format!("checkpoint: {}", label);
        let oid = repo
            .stash_save(&sig, &stash_msg, Some(StashFlags::INCLUDE_UNTRACKED))
            .map_err(|e| format!("Stash: {}", e))?;
        Some(oid.to_string())
    } else {
        None
    };

    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let has_stash = stash_oid.is_some();
    conn.execute(
        "INSERT INTO checkpoints (worktree_id, label, head_sha, stash_oid) VALUES (?1, ?2, ?3, ?4)",
        params![worktree_id, label, head_sha, stash_oid],
    )
    .map_err(|e| format!("DB insert: {}", e))?;
    let id = conn.last_insert_rowid();
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM checkpoints WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("DB query: {}", e))?;
    drop(conn);

    Ok(CheckpointEntry {
        id,
        label,
        head_sha,
        has_stash,
        created_at,
    })
}

/// List all checkpoints for a worktree, newest first.
#[tauri::command]
pub fn list_checkpoints(
    db: State<'_, AppDb>,
    worktree_id: i64,
) -> Result<Vec<CheckpointEntry>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, label, head_sha, stash_oid, created_at
             FROM checkpoints WHERE worktree_id = ?1 ORDER BY id DESC",
        )
        .map_err(|e| format!("DB prepare: {}", e))?;

    let entries = stmt
        .query_map(params![worktree_id], |row| {
            let stash_oid: Option<String> = row.get(3)?;
            Ok(CheckpointEntry {
                id: row.get(0)?,
                label: row.get(1)?,
                head_sha: row.get(2)?,
                has_stash: stash_oid.is_some(),
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("DB query: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB row: {}", e))?;

    Ok(entries)
}

/// Roll back to a checkpoint: hard-reset HEAD and restore any stashed changes.
#[tauri::command]
pub fn rollback_to_checkpoint(
    db: State<'_, AppDb>,
    worktree_id: i64,
    checkpoint_id: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let row: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT head_sha, stash_oid FROM checkpoints WHERE id = ?1 AND worktree_id = ?2",
            params![checkpoint_id, worktree_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();
    drop(conn);

    let (head_sha, stash_oid) = row.ok_or("Checkpoint not found")?;

    let mut repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;

    // Hard-reset to the checkpoint's HEAD
    let oid = Oid::from_str(&head_sha).map_err(|e| format!("Invalid OID: {}", e))?;
    {
        let obj = repo
            .find_object(oid, Some(git2::ObjectType::Commit))
            .map_err(|e| format!("Object: {}", e))?;
        repo.reset(&obj, git2::ResetType::Hard, None)
            .map_err(|e| format!("Reset: {}", e))?;
    } // `obj` drops here, releasing the immutable borrow

    // Apply the stash if one was saved at checkpoint time
    if let Some(stash_sha) = stash_oid {
        let target_oid = Oid::from_str(&stash_sha).map_err(|e| format!("Stash OID: {}", e))?;

        let mut stash_index: Option<usize> = None;
        repo.stash_foreach(|idx, _msg, oid| {
            if *oid == target_oid {
                stash_index = Some(idx);
                false
            } else {
                true
            }
        })
        .map_err(|e| format!("Stash foreach: {}", e))?;

        if let Some(idx) = stash_index {
            repo.stash_apply(idx, None)
                .map_err(|e| format!("Stash apply: {}", e))?;
        }
    }

    Ok(())
}

/// Delete a checkpoint and drop its associated stash if present.
#[tauri::command]
pub fn delete_checkpoint(
    db: State<'_, AppDb>,
    worktree_id: i64,
    checkpoint_id: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let stash_oid: Option<String> = conn
        .query_row(
            "SELECT stash_oid FROM checkpoints WHERE id = ?1 AND worktree_id = ?2",
            params![checkpoint_id, worktree_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    conn.execute(
        "DELETE FROM checkpoints WHERE id = ?1 AND worktree_id = ?2",
        params![checkpoint_id, worktree_id],
    )
    .map_err(|e| format!("DB delete: {}", e))?;
    drop(conn);

    // Drop the associated stash (best-effort)
    if let Some(stash_sha) = stash_oid {
        if let Ok(mut repo) = Repository::open(&wt.path) {
            if let Ok(target_oid) = Oid::from_str(&stash_sha) {
                let mut stash_index: Option<usize> = None;
                let _ = repo.stash_foreach(|idx, _msg, oid| {
                    if *oid == target_oid {
                        stash_index = Some(idx);
                        false
                    } else {
                        true
                    }
                });
                if let Some(idx) = stash_index {
                    let _ = repo.stash_drop(idx);
                }
            }
        }
    }

    Ok(())
}
