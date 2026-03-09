use super::BranchInfo;
use crate::db::queries;
use crate::db::AppDb;
use git2::{BranchType, Repository};
use tauri::State;

/// Lists all local and remote branches for a project.
#[tauri::command]
pub fn list_branches(db: State<'_, AppDb>, project_id: i64) -> Result<Vec<BranchInfo>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let project = queries::get_project(&conn, project_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found")?;
    drop(conn);

    let repo = Repository::open(&project.local_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    let mut branches = Vec::new();

    // Local branches
    for branch_result in repo
        .branches(Some(BranchType::Local))
        .map_err(|e| format!("Failed to list branches: {}", e))?
    {
        let (branch, _) = branch_result.map_err(|e| format!("Branch error: {}", e))?;
        if let Ok(Some(name)) = branch.name() {
            branches.push(BranchInfo {
                name: name.to_string(),
                is_head: branch.is_head(),
                is_remote: false,
            });
        }
    }

    // Remote branches
    for branch_result in repo
        .branches(Some(BranchType::Remote))
        .map_err(|e| format!("Failed to list remote branches: {}", e))?
    {
        let (branch, _) = branch_result.map_err(|e| format!("Branch error: {}", e))?;
        if let Ok(Some(name)) = branch.name() {
            branches.push(BranchInfo {
                name: name.to_string(),
                is_head: false,
                is_remote: true,
            });
        }
    }

    Ok(branches)
}

/// Creates a new branch from HEAD or from a specified ref.
#[tauri::command]
pub fn create_branch(
    db: State<'_, AppDb>,
    project_id: i64,
    name: String,
    from: Option<String>,
) -> Result<BranchInfo, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let project = queries::get_project(&conn, project_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found")?;
    drop(conn);

    let repo = Repository::open(&project.local_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    let commit = if let Some(ref from_ref) = from {
        let obj = repo
            .revparse_single(from_ref)
            .map_err(|e| format!("Failed to resolve '{}': {}", from_ref, e))?;
        obj.peel_to_commit()
            .map_err(|e| format!("Failed to get commit: {}", e))?
    } else {
        repo.head()
            .map_err(|e| format!("Failed to get HEAD: {}", e))?
            .peel_to_commit()
            .map_err(|e| format!("Failed to get HEAD commit: {}", e))?
    };

    let branch = repo
        .branch(&name, &commit, false)
        .map_err(|e| format!("Failed to create branch '{}': {}", name, e))?;

    Ok(BranchInfo {
        name: branch.name().ok().flatten().unwrap_or(&name).to_string(),
        is_head: false,
        is_remote: false,
    })
}
