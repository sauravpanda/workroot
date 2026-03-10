use crate::db::queries;
use crate::db::AppDb;
use git2::Repository;
use serde::Serialize;
use tauri::State;

/// Result of comparing two branches.
#[derive(Debug, Serialize)]
pub struct BranchComparison {
    pub base_branch: String,
    pub head_branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub commits: Vec<CompareCommit>,
    pub changed_files: Vec<ChangedFile>,
}

/// A commit unique to the head branch relative to the base.
#[derive(Debug, Serialize)]
pub struct CompareCommit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

/// A file that differs between the two branches.
#[derive(Debug, Serialize)]
pub struct ChangedFile {
    pub path: String,
    pub status: String, // "added", "modified", "deleted", "renamed"
    pub additions: usize,
    pub deletions: usize,
}

/// Compare two branches within a worktree's repository.
///
/// Returns ahead/behind counts, the list of commits on `head` not on `base`,
/// and the changed files between the merge-base and `head`.
#[tauri::command]
pub fn compare_branches(
    db: State<'_, AppDb>,
    worktree_id: i64,
    base: String,
    head: String,
) -> Result<BranchComparison, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    // Resolve both refs to their commit OIDs.
    let base_obj = repo
        .revparse_single(&base)
        .map_err(|e| format!("Failed to resolve '{}': {}", base, e))?;
    let head_obj = repo
        .revparse_single(&head)
        .map_err(|e| format!("Failed to resolve '{}': {}", head, e))?;

    let base_oid = base_obj
        .peel_to_commit()
        .map_err(|e| format!("Base is not a commit: {}", e))?
        .id();
    let head_oid = head_obj
        .peel_to_commit()
        .map_err(|e| format!("Head is not a commit: {}", e))?
        .id();

    // Ahead / behind counts.
    let (ahead, behind) = repo
        .graph_ahead_behind(head_oid, base_oid)
        .map_err(|e| format!("graph_ahead_behind: {}", e))?;

    // Walk commits reachable from head but not from base.
    let mut revwalk = repo.revwalk().map_err(|e| format!("Revwalk: {}", e))?;
    revwalk
        .push(head_oid)
        .map_err(|e| format!("Revwalk push: {}", e))?;
    revwalk
        .hide(base_oid)
        .map_err(|e| format!("Revwalk hide: {}", e))?;

    let mut commits = Vec::new();
    for oid_result in revwalk {
        let oid = oid_result.map_err(|e| format!("Revwalk iter: {}", e))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("Find commit: {}", e))?;

        let message = commit
            .message()
            .unwrap_or("")
            .lines()
            .next()
            .unwrap_or("")
            .to_string();

        let author = commit.author();
        let author_name = author.name().unwrap_or("Unknown").to_string();

        let time = commit.time();
        let secs = time.seconds();
        let date = chrono::DateTime::from_timestamp(secs, 0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();

        commits.push(CompareCommit {
            hash: oid.to_string(),
            message,
            author: author_name,
            date,
        });
    }

    // Diff between merge-base and head for changed files.
    let merge_base = repo
        .merge_base(base_oid, head_oid)
        .map_err(|e| format!("merge_base: {}", e))?;

    let merge_base_commit = repo
        .find_commit(merge_base)
        .map_err(|e| format!("Find merge-base commit: {}", e))?;
    let merge_base_tree = merge_base_commit
        .tree()
        .map_err(|e| format!("Merge-base tree: {}", e))?;

    let head_commit = repo
        .find_commit(head_oid)
        .map_err(|e| format!("Find head commit: {}", e))?;
    let head_tree = head_commit
        .tree()
        .map_err(|e| format!("Head tree: {}", e))?;

    let diff = repo
        .diff_tree_to_tree(Some(&merge_base_tree), Some(&head_tree), None)
        .map_err(|e| format!("Diff: {}", e))?;

    let mut changed_files = Vec::new();

    for (idx, delta) in diff.deltas().enumerate() {
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
            _ => "modified",
        }
        .to_string();

        // Count additions and deletions via patch stats.
        let (additions, deletions) =
            if let Ok(Some(ref p)) = git2::Patch::from_diff(&diff, idx) {
                let (_, adds, dels) = p.line_stats().unwrap_or((0, 0, 0));
                (adds, dels)
            } else {
                (0, 0)
            };

        changed_files.push(ChangedFile {
            path,
            status,
            additions,
            deletions,
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
