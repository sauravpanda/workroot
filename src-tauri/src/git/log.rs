use crate::db::{queries, AppDb};
use git2::Repository;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct GitLogEntry {
    pub commit_id: String,
    pub short_id: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
    pub parents: Vec<String>,
}

fn commit_to_entry(commit: &git2::Commit) -> GitLogEntry {
    let commit_id = commit.id().to_string();
    let short_id = commit_id.chars().take(7).collect();
    let author = String::from_utf8_lossy(commit.author().name_bytes()).to_string();
    let email = String::from_utf8_lossy(commit.author().email_bytes()).to_string();
    let date = commit.time().seconds().to_string();
    let message = commit.message().unwrap_or("").to_string();
    let parents = commit.parent_ids().map(|id| id.to_string()).collect();

    GitLogEntry {
        commit_id,
        short_id,
        author,
        email,
        date,
        message,
        parents,
    }
}

/// Get paginated commit log using git2 revwalk.
#[tauri::command]
pub fn get_git_log(
    worktree_id: i64,
    db: State<'_, AppDb>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<GitLogEntry>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let mut revwalk = repo.revwalk().map_err(|e| format!("Revwalk: {}", e))?;
    revwalk
        .push_head()
        .map_err(|e| format!("Push HEAD: {}", e))?;
    revwalk
        .set_sorting(git2::Sort::TIME)
        .map_err(|e| format!("Sort: {}", e))?;

    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    let entries: Vec<GitLogEntry> = revwalk
        .filter_map(|oid| oid.ok())
        .filter_map(|oid| repo.find_commit(oid).ok())
        .skip(offset)
        .take(limit)
        .map(|commit| commit_to_entry(&commit))
        .collect();

    Ok(entries)
}

/// Get details of a specific commit by its ID.
#[tauri::command]
pub fn get_commit_detail(
    worktree_id: i64,
    db: State<'_, AppDb>,
    commit_id: String,
) -> Result<GitLogEntry, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let oid = git2::Oid::from_str(&commit_id).map_err(|e| format!("Invalid OID: {}", e))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|e| format!("Commit: {}", e))?;

    Ok(commit_to_entry(&commit))
}

/// Search commits by message content.
#[tauri::command]
pub fn search_git_log(
    worktree_id: i64,
    db: State<'_, AppDb>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<GitLogEntry>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let mut revwalk = repo.revwalk().map_err(|e| format!("Revwalk: {}", e))?;
    revwalk
        .push_head()
        .map_err(|e| format!("Push HEAD: {}", e))?;
    revwalk
        .set_sorting(git2::Sort::TIME)
        .map_err(|e| format!("Sort: {}", e))?;

    let limit = limit.unwrap_or(50);
    let query_lower = query.to_lowercase();

    let entries: Vec<GitLogEntry> = revwalk
        .filter_map(|oid| oid.ok())
        .filter_map(|oid| repo.find_commit(oid).ok())
        .filter(|commit| {
            commit
                .message()
                .unwrap_or("")
                .to_lowercase()
                .contains(&query_lower)
        })
        .take(limit)
        .map(|commit| commit_to_entry(&commit))
        .collect();

    Ok(entries)
}
