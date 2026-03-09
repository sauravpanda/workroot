use crate::db::queries;
use crate::db::AppDb;
use git2::{DiffOptions, Repository, StatusOptions};
use serde::Serialize;
use tauri::State;

/// A changed file in the working tree.
#[derive(Debug, Serialize)]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

/// Diff content for a single file.
#[derive(Debug, Serialize)]
pub struct FileDiff {
    pub path: String,
    pub hunks: Vec<DiffHunk>,
    pub is_binary: bool,
}

/// A hunk within a diff.
#[derive(Debug, Serialize)]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

/// A single line in a diff.
#[derive(Debug, Serialize)]
pub struct DiffLine {
    pub origin: String,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

/// Get all changed files for a worktree.
#[tauri::command]
pub fn get_changed_files(
    db: State<'_, AppDb>,
    worktree_id: i64,
) -> Result<Vec<ChangedFile>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("Git: {}", e))?;

    let mut files = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        // Index (staged) changes
        if status.is_index_new() {
            files.push(ChangedFile {
                path: path.clone(),
                status: "added".into(),
                staged: true,
            });
        } else if status.is_index_modified() {
            files.push(ChangedFile {
                path: path.clone(),
                status: "modified".into(),
                staged: true,
            });
        } else if status.is_index_deleted() {
            files.push(ChangedFile {
                path: path.clone(),
                status: "deleted".into(),
                staged: true,
            });
        } else if status.is_index_renamed() {
            files.push(ChangedFile {
                path: path.clone(),
                status: "renamed".into(),
                staged: true,
            });
        }

        // Working tree (unstaged) changes
        if status.is_wt_modified() {
            files.push(ChangedFile {
                path: path.clone(),
                status: "modified".into(),
                staged: false,
            });
        } else if status.is_wt_deleted() {
            files.push(ChangedFile {
                path: path.clone(),
                status: "deleted".into(),
                staged: false,
            });
        } else if status.is_wt_new() {
            files.push(ChangedFile {
                path,
                status: "untracked".into(),
                staged: false,
            });
        }
    }

    Ok(files)
}

/// Get diff content for a specific file.
#[tauri::command]
pub fn get_file_diff(
    db: State<'_, AppDb>,
    worktree_id: i64,
    file_path: String,
    staged: bool,
) -> Result<FileDiff, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    let mut opts = DiffOptions::new();
    opts.pathspec(&file_path);

    let diff = if staged {
        let head = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head.as_ref(), None, Some(&mut opts))
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))
    }
    .map_err(|e| format!("Diff: {}", e))?;

    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut is_binary = false;

    // Check for binary
    diff.foreach(
        &mut |delta, _| {
            if delta.flags().is_binary() {
                is_binary = true;
            }
            true
        },
        None,
        None,
        None,
    )
    .map_err(|e| format!("Diff check: {}", e))?;

    if !is_binary {
        diff.print(git2::DiffFormat::Patch, |_, hunk, line| {
            match line.origin() {
                'H' => {
                    // Hunk header
                    if let Some(h) = hunk {
                        let header = String::from_utf8_lossy(h.header()).to_string();
                        hunks.push(DiffHunk {
                            header,
                            lines: Vec::new(),
                        });
                    }
                }
                '+' | '-' | ' ' => {
                    let origin = String::from(line.origin());
                    let content = String::from_utf8_lossy(line.content()).to_string();
                    if let Some(current_hunk) = hunks.last_mut() {
                        current_hunk.lines.push(DiffLine {
                            origin,
                            content,
                            old_lineno: line.old_lineno(),
                            new_lineno: line.new_lineno(),
                        });
                    }
                }
                _ => {}
            }
            true
        })
        .map_err(|e| format!("Diff print: {}", e))?;
    }

    Ok(FileDiff {
        path: file_path,
        hunks,
        is_binary,
    })
}

/// Stage specific files.
#[tauri::command]
pub fn stage_files(
    db: State<'_, AppDb>,
    worktree_id: i64,
    files: Vec<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;
    let mut index = repo.index().map_err(|e| format!("Index: {}", e))?;

    for file in &files {
        let full_path = std::path::Path::new(&worktree.path).join(file);
        if full_path.exists() {
            index
                .add_path(std::path::Path::new(file))
                .map_err(|e| format!("Stage {}: {}", file, e))?;
        } else {
            index
                .remove_path(std::path::Path::new(file))
                .map_err(|e| format!("Stage remove {}: {}", file, e))?;
        }
    }

    index.write().map_err(|e| format!("Index write: {}", e))?;
    Ok(())
}

/// Unstage specific files.
#[tauri::command]
pub fn unstage_files(
    db: State<'_, AppDb>,
    worktree_id: i64,
    files: Vec<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    let head = repo.head().map_err(|e| format!("HEAD: {}", e))?;
    let head_commit = head
        .peel_to_commit()
        .map_err(|e| format!("Commit: {}", e))?;

    let paths: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    repo.reset_default(Some(head_commit.as_object()), paths.iter())
        .map_err(|e| format!("Unstage: {}", e))?;

    Ok(())
}
