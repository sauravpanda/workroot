use crate::db::queries::{self, ProjectRow};
use crate::db::AppDb;
use crate::github::{auth, repos};
use serde::Serialize;
use std::path::Path;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct ProjectInfo {
    pub id: i64,
    pub name: String,
    pub github_url: Option<String>,
    pub local_path: String,
    pub framework: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub exists_locally: bool,
}

impl From<ProjectRow> for ProjectInfo {
    fn from(row: ProjectRow) -> Self {
        let exists_locally = Path::new(&row.local_path).exists();
        ProjectInfo {
            id: row.id,
            name: row.name,
            github_url: row.github_url,
            local_path: row.local_path,
            framework: row.framework,
            created_at: row.created_at,
            updated_at: row.updated_at,
            exists_locally,
        }
    }
}

/// Registers a local directory as a Workroot project.
#[tauri::command]
pub fn register_project(
    db: State<'_, AppDb>,
    name: String,
    local_path: String,
    github_url: Option<String>,
    framework: Option<String>,
) -> Result<ProjectInfo, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Check if already registered
    let existing = queries::list_projects(&conn).map_err(|e| format!("DB error: {}", e))?;
    if existing.iter().any(|p| p.local_path == local_path) {
        return Err("A project with this path is already registered.".into());
    }

    // Verify the path exists
    if !Path::new(&local_path).is_dir() {
        return Err(format!("Directory does not exist: {}", local_path));
    }

    let id = queries::insert_project(
        &conn,
        &name,
        &local_path,
        github_url.as_deref(),
        framework.as_deref(),
    )
    .map_err(|e| format!("Failed to register project: {}", e))?;

    let project = queries::get_project(&conn, id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found after insert")?;

    Ok(project.into())
}

/// Lists all registered projects.
#[tauri::command]
pub fn list_projects(db: State<'_, AppDb>) -> Result<Vec<ProjectInfo>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let rows = queries::list_projects(&conn).map_err(|e| format!("DB error: {}", e))?;
    Ok(rows.into_iter().map(ProjectInfo::from).collect())
}

/// Removes a project from the database (does not delete files).
#[tauri::command]
pub fn remove_project(db: State<'_, AppDb>, id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_project(&conn, id).map_err(|e| format!("DB error: {}", e))
}

/// Fetches the user's GitHub repos (requires authentication).
#[tauri::command]
pub async fn list_github_repos() -> Result<Vec<repos::GitHubRepo>, String> {
    repos::list_user_repos().await
}

/// Clones a GitHub repo and registers it as a project.
#[tauri::command]
pub async fn clone_and_register(
    db: State<'_, AppDb>,
    clone_url: String,
    name: String,
    target_dir: String,
    github_url: Option<String>,
) -> Result<ProjectInfo, String> {
    let local_path = Path::new(&target_dir).join(&name);
    let local_path_str = local_path.to_str().ok_or("Invalid path")?.to_string();

    // Check if path already exists
    if local_path.exists() {
        return Err(format!("Directory already exists: {}", local_path_str));
    }

    // Get token for clone auth
    let token = auth::get_token()?
        .ok_or_else(|| "Not authenticated. Please sign in with GitHub first.".to_string())?;

    // Clone in a blocking task to not block the async runtime
    let clone_url_owned = clone_url.clone();
    let path_for_clone = local_path_str.clone();
    tokio::task::spawn_blocking(move || {
        repos::clone_repo(&clone_url_owned, &path_for_clone, &token)
    })
    .await
    .map_err(|e| format!("Clone task failed: {}", e))??;

    // Register in DB
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let id = queries::insert_project(&conn, &name, &local_path_str, github_url.as_deref(), None)
        .map_err(|e| format!("Failed to register project: {}", e))?;

    let project = queries::get_project(&conn, id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found after insert")?;

    Ok(project.into())
}

/// Detects framework from package files in a directory.
pub fn detect_framework(path: &Path) -> Option<String> {
    if path.join("package.json").exists() {
        if path.join("next.config.js").exists() || path.join("next.config.mjs").exists() {
            return Some("Next.js".into());
        }
        if path.join("vite.config.ts").exists() || path.join("vite.config.js").exists() {
            return Some("Vite".into());
        }
        return Some("Node.js".into());
    }
    if path.join("Cargo.toml").exists() {
        return Some("Rust".into());
    }
    if path.join("go.mod").exists() {
        return Some("Go".into());
    }
    if path.join("requirements.txt").exists()
        || path.join("pyproject.toml").exists()
        || path.join("setup.py").exists()
    {
        return Some("Python".into());
    }
    None
}

/// Scans a local directory and registers it as a project.
/// Auto-detects the project name from the directory name and the framework.
#[tauri::command]
pub fn register_local_project(
    db: State<'_, AppDb>,
    local_path: String,
) -> Result<ProjectInfo, String> {
    let path = Path::new(&local_path);

    if !path.is_dir() {
        return Err(format!("Not a directory: {}", local_path));
    }

    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Could not determine project name from path")?
        .to_string();

    let framework = detect_framework(path);

    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Check if already registered
    let existing = queries::list_projects(&conn).map_err(|e| format!("DB error: {}", e))?;
    if existing.iter().any(|p| p.local_path == local_path) {
        return Err("This directory is already registered as a project.".into());
    }

    // Check if it's a git repo — use the GitHub URL if available
    let github_url = git2::Repository::open(path).ok().and_then(|repo| {
        repo.find_remote("origin")
            .ok()
            .and_then(|remote| remote.url().map(String::from))
    });

    let id = queries::insert_project(
        &conn,
        &name,
        &local_path,
        github_url.as_deref(),
        framework.as_deref(),
    )
    .map_err(|e| format!("Failed to register project: {}", e))?;

    let project = queries::get_project(&conn, id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found after insert")?;

    Ok(project.into())
}
