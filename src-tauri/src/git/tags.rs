use crate::db::{queries, AppDb};
use git2::Repository;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct GitTag {
    pub name: String,
    pub message: Option<String>,
    pub tagger: Option<String>,
    pub date: Option<String>,
    pub commit_id: String,
    pub is_annotated: bool,
}

/// List all tags in the repository.
#[tauri::command]
pub fn list_tags(worktree_id: i64, db: State<'_, AppDb>) -> Result<Vec<GitTag>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let tag_names = repo.tag_names(None).map_err(|e| format!("Tags: {}", e))?;

    let mut tags = Vec::new();
    for name in tag_names.iter().flatten() {
        let refname = format!("refs/tags/{}", name);
        let reference = repo
            .find_reference(&refname)
            .map_err(|e| format!("Ref: {}", e))?;
        let obj = reference
            .peel(git2::ObjectType::Any)
            .map_err(|e| format!("Peel: {}", e))?;

        // Try to resolve as an annotated tag
        if let Ok(tag_obj) = obj.clone().into_tag() {
            let commit_id = tag_obj.target_id().to_string();
            let message = tag_obj.message().map(|m| m.to_string());
            let tagger = tag_obj
                .tagger()
                .map(|s| String::from_utf8_lossy(s.name_bytes()).to_string());
            let date = tag_obj.tagger().map(|s| s.when().seconds().to_string());

            tags.push(GitTag {
                name: name.to_string(),
                message,
                tagger,
                date,
                commit_id,
                is_annotated: true,
            });
        } else {
            // Lightweight tag — resolve to commit
            let commit_id = reference
                .peel(git2::ObjectType::Commit)
                .map(|c| c.id().to_string())
                .unwrap_or_else(|_| obj.id().to_string());

            tags.push(GitTag {
                name: name.to_string(),
                message: None,
                tagger: None,
                date: None,
                commit_id,
                is_annotated: false,
            });
        }
    }

    Ok(tags)
}

/// Create a tag. If `message` is provided, creates an annotated tag; otherwise lightweight.
#[tauri::command]
pub fn create_tag(
    worktree_id: i64,
    db: State<'_, AppDb>,
    tag_name: String,
    message: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    let head = repo.head().map_err(|e| format!("HEAD: {}", e))?;
    let commit = head
        .peel_to_commit()
        .map_err(|e| format!("Commit: {}", e))?;
    let obj = commit.as_object();

    if let Some(msg) = message {
        let sig = repo.signature().map_err(|e| format!("Signature: {}", e))?;
        repo.tag(&tag_name, obj, &sig, &msg, false)
            .map_err(|e| format!("Tag: {}", e))?;
    } else {
        repo.tag_lightweight(&tag_name, obj, false)
            .map_err(|e| format!("Tag: {}", e))?;
    }

    Ok(())
}

/// Delete a tag by name.
#[tauri::command]
pub fn delete_tag(worktree_id: i64, db: State<'_, AppDb>, tag_name: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;
    repo.tag_delete(&tag_name)
        .map_err(|e| format!("Delete tag: {}", e))?;

    Ok(())
}
