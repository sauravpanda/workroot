use crate::db::{queries, AppDb};
use git2::{DiffOptions, Repository};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct CompareCommit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[derive(Debug, Serialize)]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct BranchComparison {
    pub base_branch: String,
    pub head_branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub commits: Vec<CompareCommit>,
    pub changed_files: Vec<ChangedFile>,
}

/// Compare two branches, returning ahead/behind counts, commits, and changed files.
#[tauri::command]
pub fn compare_branches(
    db: State<'_, AppDb>,
    worktree_id: i64,
    base: String,
    head: String,
) -> Result<BranchComparison, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;

    let base_obj = repo
        .revparse_single(&base)
        .map_err(|e| format!("Resolve base '{}': {}", base, e))?;
    let head_obj = repo
        .revparse_single(&head)
        .map_err(|e| format!("Resolve head '{}': {}", head, e))?;

    let base_oid = base_obj
        .peel_to_commit()
        .map_err(|e| format!("Base commit: {}", e))?
        .id();
    let head_oid = head_obj
        .peel_to_commit()
        .map_err(|e| format!("Head commit: {}", e))?
        .id();

    let (ahead, behind) = repo
        .graph_ahead_behind(head_oid, base_oid)
        .map_err(|e| format!("Graph: {}", e))?;

    // Walk commits that are in head but not in base
    let mut revwalk = repo.revwalk().map_err(|e| format!("Revwalk: {}", e))?;
    revwalk
        .push(head_oid)
        .map_err(|e| format!("Revwalk push: {}", e))?;
    revwalk
        .hide(base_oid)
        .map_err(|e| format!("Revwalk hide: {}", e))?;

    let mut commits = Vec::new();
    for oid_result in revwalk {
        let oid = oid_result.map_err(|e| format!("Revwalk: {}", e))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("Find commit: {}", e))?;
        commits.push(CompareCommit {
            hash: oid.to_string(),
            message: commit.summary().unwrap_or("").to_string(),
            author: String::from_utf8_lossy(commit.author().name_bytes()).to_string(),
            date: commit.time().seconds().to_string(),
        });
    }

    // Diff trees to find changed files
    let base_tree = repo
        .find_commit(base_oid)
        .map_err(|e| format!("Base commit: {}", e))?
        .tree()
        .map_err(|e| format!("Base tree: {}", e))?;
    let head_tree = repo
        .find_commit(head_oid)
        .map_err(|e| format!("Head commit: {}", e))?
        .tree()
        .map_err(|e| format!("Head tree: {}", e))?;

    let mut diff_opts = DiffOptions::new();
    let diff = repo
        .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut diff_opts))
        .map_err(|e| format!("Diff: {}", e))?;

    let mut changed_files = Vec::new();
    for delta in diff.deltas() {
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let status = match delta.status() {
            git2::Delta::Added => "added",
            git2::Delta::Deleted => "deleted",
            git2::Delta::Modified => "modified",
            git2::Delta::Renamed => "renamed",
            git2::Delta::Copied => "copied",
            _ => "unknown",
        };

        changed_files.push(ChangedFile {
            path,
            status: status.to_string(),
        });
    }

    Ok(BranchComparison {
        base_branch: base,
        head_branch: head,
        ahead,
        behind,
        commits,
        changed_files,
    })
}
