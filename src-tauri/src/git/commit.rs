use crate::db::queries;
use crate::db::AppDb;
use git2::Repository;
use serde::Serialize;
use tauri::State;

/// Push status info.
#[derive(Debug, Serialize)]
pub struct PushStatus {
    pub ahead: usize,
    pub behind: usize,
    pub remote_branch: Option<String>,
}

/// Create a commit with the current staged files.
#[tauri::command]
pub fn git_commit(
    db: State<'_, AppDb>,
    worktree_id: i64,
    message: String,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    let mut index = repo.index().map_err(|e| format!("Index: {}", e))?;
    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("Write tree: {}", e))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("Find tree: {}", e))?;

    let sig = repo.signature().map_err(|e| format!("Signature: {}", e))?;

    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());

    let parents: Vec<&git2::Commit> = parent.iter().collect();

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| format!("Commit: {}", e))?;

    Ok(oid.to_string())
}

/// Push to the remote tracking branch.
#[tauri::command]
pub fn git_push(db: State<'_, AppDb>, worktree_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    let head = repo.head().map_err(|e| format!("HEAD: {}", e))?;
    let branch_name = head
        .shorthand()
        .ok_or("Cannot determine branch name")?
        .to_string();

    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("Remote: {}", e))?;

    let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);
    remote
        .push(&[&refspec], None)
        .map_err(|e| format!("Push: {}", e))?;

    Ok(())
}

/// Get push status (ahead/behind remote).
#[tauri::command]
pub fn get_push_status(db: State<'_, AppDb>, worktree_id: i64) -> Result<PushStatus, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    let head = repo.head().map_err(|e| format!("HEAD: {}", e))?;
    let branch_name = head
        .shorthand()
        .ok_or("Cannot determine branch")?
        .to_string();

    let remote_ref = format!("refs/remotes/origin/{}", branch_name);

    let local_oid = head.target().ok_or("No local commit")?;

    let remote_branch = match repo.find_reference(&remote_ref) {
        Ok(r) => r,
        Err(_) => {
            return Ok(PushStatus {
                ahead: 0,
                behind: 0,
                remote_branch: None,
            })
        }
    };

    let remote_oid = remote_branch.target().ok_or("No remote commit")?;

    let (ahead, behind) = repo
        .graph_ahead_behind(local_oid, remote_oid)
        .map_err(|e| format!("Graph: {}", e))?;

    Ok(PushStatus {
        ahead,
        behind,
        remote_branch: Some(format!("origin/{}", branch_name)),
    })
}
