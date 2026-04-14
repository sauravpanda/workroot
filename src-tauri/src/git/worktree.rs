use super::{DeleteWarnings, WorktreeInfo};
use crate::db::queries;
use crate::db::AppDb;
use crate::validate;
use git2::{Repository, StatusOptions, WorktreeAddOptions};
use std::path::Path;
use tauri::State;

/// Checks whether the working directory at `path` has uncommitted changes.
fn check_is_dirty(path: &str) -> bool {
    let repo = match Repository::open(path) {
        Ok(r) => r,
        Err(_) => return false,
    };

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let result = match repo.statuses(Some(&mut opts)) {
        Ok(statuses) => !statuses.is_empty(),
        Err(_) => false,
    };
    result
}

fn row_to_info(row: queries::WorktreeRow) -> WorktreeInfo {
    let is_dirty = check_is_dirty(&row.path);
    let (ahead, behind) = count_ahead_behind(&row.path);
    WorktreeInfo {
        id: row.id,
        project_id: row.project_id,
        branch_name: row.branch_name,
        path: row.path,
        status: row.status,
        is_dirty,
        port: row.port,
        ahead,
        behind,
        created_at: row.created_at,
        deleted_at: row.deleted_at,
        hidden_at: row.hidden_at,
    }
}

/// Creates a git worktree for the given project and branch.
/// If `create_new_branch` is true, a new branch is created from HEAD first.
/// Worktrees are placed in `<project_root>/.worktrees/<branch_name>/`.
#[tauri::command]
pub fn create_worktree(
    db: State<'_, AppDb>,
    project_id: i64,
    branch_name: String,
    create_new_branch: bool,
) -> Result<WorktreeInfo, String> {
    validate::branch_name(&branch_name)?;

    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let project = queries::get_project(&conn, project_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found")?;

    // Check if an active worktree for this branch already exists in DB
    let existing =
        queries::list_worktrees(&conn, project_id).map_err(|e| format!("DB error: {}", e))?;
    if existing.iter().any(|w| w.branch_name == branch_name) {
        return Err(format!(
            "Worktree for branch '{}' already exists",
            branch_name
        ));
    }
    drop(conn);

    let repo = Repository::open(&project.local_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    let worktree_dir = Path::new(&project.local_path).join(".worktrees");
    let worktree_path = worktree_dir.join(&branch_name);

    if !worktree_dir.exists() {
        std::fs::create_dir_all(&worktree_dir)
            .map_err(|e| format!("Failed to create .worktrees directory: {}", e))?;
    }

    // Keep .worktrees/ out of the parent repo's git status by writing to .git/info/exclude
    let exclude_path = Path::new(&project.local_path)
        .join(".git")
        .join("info")
        .join("exclude");
    let already_excluded = std::fs::read_to_string(&exclude_path)
        .map(|s| s.contains(".worktrees/"))
        .unwrap_or(false);
    if !already_excluded {
        if let Some(parent) = exclude_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&exclude_path)
            .map_err(|e| format!("Failed to open .git/info/exclude: {}", e))?;
        use std::io::Write;
        writeln!(file, "\n# Workroot managed worktrees\n.worktrees/")
            .map_err(|e| format!("Failed to write to .git/info/exclude: {}", e))?;
    }

    if worktree_path.exists() {
        // Check if this is a stale worktree directory (exists on disk but not
        // registered in git). If so, clean it up and continue.
        let is_registered = repo
            .worktrees()
            .map(|wts| {
                (0..wts.len()).any(|i| {
                    wts.get(i)
                        .map(|name| name == branch_name)
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);
        if is_registered {
            return Err(format!(
                "Worktree path already exists: {}",
                worktree_path.display()
            ));
        }
        // Stale directory — remove it so we can recreate the worktree
        std::fs::remove_dir_all(&worktree_path).map_err(|e| {
            format!(
                "Failed to clean up stale worktree path '{}': {}",
                worktree_path.display(),
                e
            )
        })?;
        // Also clean up stale git worktree metadata if it exists
        let git_wt_meta = Path::new(&project.local_path)
            .join(".git")
            .join("worktrees")
            .join(&branch_name);
        if git_wt_meta.exists() {
            let _ = std::fs::remove_dir_all(&git_wt_meta);
        }
    }

    if create_new_branch {
        let head = match repo.head() {
            Ok(h) => h,
            Err(_) => {
                return Err(
                    "Cannot create a worktree: repository has no commits yet. Make an initial commit first.".into(),
                );
            }
        };
        let head_commit = head
            .peel_to_commit()
            .map_err(|e| format!("Failed to get HEAD commit: {}", e))?;
        let branch = repo
            .branch(&branch_name, &head_commit, false)
            .map_err(|e| format!("Failed to create branch '{}': {}", branch_name, e))?;

        let reference = branch.into_reference();
        let mut opts = WorktreeAddOptions::new();
        opts.reference(Some(&reference));

        repo.worktree(&branch_name, &worktree_path, Some(&opts))
            .map_err(|e| format!("Failed to create worktree: {}", e))?;
    } else {
        let branch = repo
            .find_branch(&branch_name, git2::BranchType::Local)
            .map_err(|e| format!("Branch '{}' not found: {}", branch_name, e))?;

        let reference = branch.into_reference();
        let mut opts = WorktreeAddOptions::new();
        opts.reference(Some(&reference));

        repo.worktree(&branch_name, &worktree_path, Some(&opts))
            .map_err(|e| format!("Failed to create worktree: {}", e))?;
    }

    let worktree_path_str = worktree_path.to_str().ok_or("Invalid path")?.to_string();

    // Register in DB
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let id = queries::insert_worktree(&conn, project_id, &branch_name, &worktree_path_str)
        .map_err(|e| format!("Failed to register worktree: {}", e))?;

    let row = queries::get_worktree(&conn, id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found after insert")?;

    Ok(row_to_info(row))
}

/// Lists active (non-archived) worktrees for a project with their current dirty/clean status.
#[tauri::command]
pub fn list_project_worktrees(
    db: State<'_, AppDb>,
    project_id: i64,
) -> Result<Vec<WorktreeInfo>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let rows =
        queries::list_worktrees(&conn, project_id).map_err(|e| format!("DB error: {}", e))?;
    Ok(rows.into_iter().map(row_to_info).collect())
}

/// Returns all worktrees for a project, including archived ones, for history display.
#[tauri::command]
pub fn list_worktree_history(
    db: State<'_, AppDb>,
    project_id: i64,
) -> Result<Vec<WorktreeInfo>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let rows =
        queries::list_all_worktrees(&conn, project_id).map_err(|e| format!("DB error: {}", e))?;
    Ok(rows.into_iter().map(row_to_info).collect())
}

/// Archives a worktree: marks it as deleted in the DB but leaves all files on disk intact.
#[tauri::command]
pub fn delete_worktree(db: State<'_, AppDb>, worktree_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::archive_worktree(&conn, worktree_id).map_err(|e| format!("DB error: {}", e))
}

/// Counts commits on the local branch that have not been pushed to its upstream remote.
fn count_ahead_behind(path: &str) -> (u32, u32) {
    let repo = match Repository::open(path) {
        Ok(r) => r,
        Err(_) => return (0, 0),
    };
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return (0, 0),
    };
    let local_oid = match head.target() {
        Some(oid) => oid,
        None => return (0, 0),
    };
    let branch_name = match head.shorthand() {
        Some(name) => name.to_string(),
        None => return (0, 0),
    };
    let upstream_ref = format!("refs/remotes/origin/{}", branch_name);
    let remote_oid = match repo.refname_to_id(&upstream_ref) {
        Ok(oid) => oid,
        Err(_) => return (0, 0), // no tracking branch
    };
    match repo.graph_ahead_behind(local_oid, remote_oid) {
        Ok((ahead, behind)) => (ahead as u32, behind as u32),
        Err(_) => (0, 0),
    }
}

fn count_unpushed_commits(path: &str) -> u32 {
    let repo = match Repository::open(path) {
        Ok(r) => r,
        Err(_) => return 0,
    };

    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return 0,
    };

    let local_oid = match head.target() {
        Some(oid) => oid,
        None => return 0,
    };

    let branch_name = match head.shorthand() {
        Some(name) => name.to_string(),
        None => return 0,
    };

    let upstream_ref = format!("refs/remotes/origin/{}", branch_name);
    let remote_oid = match repo.refname_to_id(&upstream_ref) {
        Ok(oid) => oid,
        Err(_) => {
            // No upstream tracking branch — all local commits are "unpushed"
            let mut count = 0u32;
            let mut revwalk = match repo.revwalk() {
                Ok(rw) => rw,
                Err(_) => return 0,
            };
            let _ = revwalk.push(local_oid);
            for _ in revwalk {
                count += 1;
            }
            return count;
        }
    };

    let (ahead, _) = match repo.graph_ahead_behind(local_oid, remote_oid) {
        Ok(counts) => counts,
        Err(_) => return 0,
    };
    ahead as u32
}

/// Returns warnings about uncommitted changes and unpushed commits for a worktree,
/// so the frontend can show a confirmation dialog before deletion.
#[tauri::command]
pub fn get_worktree_delete_warnings(
    db: State<'_, AppDb>,
    worktree_id: i64,
) -> Result<DeleteWarnings, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let row = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    Ok(DeleteWarnings {
        is_dirty: check_is_dirty(&row.path),
        unpushed_commits: count_unpushed_commits(&row.path),
    })
}

/// Hides a worktree from the sidebar without archiving or deleting it.
#[tauri::command]
pub fn hide_worktree(db: State<'_, AppDb>, worktree_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::hide_worktree(&conn, worktree_id).map_err(|e| format!("DB error: {}", e))
}

/// Unhides a previously hidden worktree, making it visible in the sidebar again.
#[tauri::command]
pub fn unhide_worktree(db: State<'_, AppDb>, worktree_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::unhide_worktree(&conn, worktree_id).map_err(|e| format!("DB error: {}", e))
}

/// Lists hidden worktrees for a project.
#[tauri::command]
pub fn list_hidden_worktrees(
    db: State<'_, AppDb>,
    project_id: i64,
) -> Result<Vec<WorktreeInfo>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let rows = queries::list_hidden_worktrees(&conn, project_id)
        .map_err(|e| format!("DB error: {}", e))?;
    Ok(rows.into_iter().map(row_to_info).collect())
}

/// Gets the current status of a worktree (dirty/clean, exists on disk).
#[tauri::command]
pub fn get_worktree_status(db: State<'_, AppDb>, worktree_id: i64) -> Result<WorktreeInfo, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let row = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    let is_dirty = check_is_dirty(&row.path);
    let exists = Path::new(&row.path).exists();

    let status = if !exists {
        "missing".to_string()
    } else {
        row.status.clone()
    };

    let (ahead, behind) = count_ahead_behind(&row.path);

    Ok(WorktreeInfo {
        id: row.id,
        project_id: row.project_id,
        branch_name: row.branch_name,
        path: row.path,
        status,
        is_dirty,
        port: row.port,
        ahead,
        behind,
        created_at: row.created_at,
        deleted_at: row.deleted_at,
        hidden_at: row.hidden_at,
    })
}
