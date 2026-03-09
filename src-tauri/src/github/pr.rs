use super::auth;
use crate::db::queries;
use crate::db::AppDb;
use git2::Repository;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct PullRequest {
    pub number: i64,
    pub title: String,
    pub html_url: String,
    pub state: String,
    pub draft: bool,
}

#[derive(Debug, Serialize)]
pub struct PrCreateResult {
    pub number: i64,
    pub html_url: String,
}

/// Parse owner and repo from a git remote URL.
/// Handles both HTTPS and SSH formats:
///   https://github.com/owner/repo.git
///   git@github.com:owner/repo.git
fn parse_github_remote(url: &str) -> Option<(String, String)> {
    let url = url.trim();
    // HTTPS: https://github.com/owner/repo.git
    if let Some(rest) = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
    {
        let rest = rest.trim_end_matches(".git");
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    // SSH: git@github.com:owner/repo.git
    if let Some(rest) = url.strip_prefix("git@github.com:") {
        let rest = rest.trim_end_matches(".git");
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    None
}

/// Get owner/repo for a worktree's git remote.
fn get_remote_info(repo: &Repository) -> Result<(String, String), String> {
    let remote = repo
        .find_remote("origin")
        .map_err(|e| format!("No origin remote: {}", e))?;
    let url = remote.url().ok_or("Remote URL is not valid UTF-8")?;
    parse_github_remote(url).ok_or_else(|| format!("Cannot parse GitHub remote from: {}", url))
}

/// Create a pull request on GitHub.
#[tauri::command]
pub async fn create_pull_request(
    db: State<'_, AppDb>,
    worktree_id: i64,
    title: String,
    body: String,
    base: String,
    draft: bool,
) -> Result<PrCreateResult, String> {
    let (owner, repo_name, head) = {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
        let worktree = queries::get_worktree(&conn, worktree_id)
            .map_err(|e| format!("DB: {}", e))?
            .ok_or("Worktree not found")?;

        let repo =
            Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;
        let (owner, repo_name) = get_remote_info(&repo)?;

        let head_ref = repo.head().map_err(|e| format!("HEAD: {}", e))?;
        let branch = head_ref
            .shorthand()
            .ok_or("Cannot determine branch")?
            .to_string();

        (owner, repo_name, branch)
    };

    let token = auth::get_token()?
        .ok_or("Not authenticated. Please sign in with GitHub first.")?;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!(
            "https://api.github.com/repos/{}/{}/pulls",
            owner, repo_name
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Workroot")
        .header("Accept", "application/vnd.github+json")
        .json(&serde_json::json!({
            "title": title,
            "body": body,
            "head": head,
            "base": base,
            "draft": draft,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to create PR: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API error ({}): {}", status, body));
    }

    let pr: PullRequest = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse PR response: {}", e))?;

    Ok(PrCreateResult {
        number: pr.number,
        html_url: pr.html_url,
    })
}

/// Check if a PR already exists for the current branch.
#[tauri::command]
pub async fn get_pr_for_branch(
    db: State<'_, AppDb>,
    worktree_id: i64,
) -> Result<Option<PullRequest>, String> {
    let (owner, repo_name, head) = {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
        let worktree = queries::get_worktree(&conn, worktree_id)
            .map_err(|e| format!("DB: {}", e))?
            .ok_or("Worktree not found")?;

        let repo =
            Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;
        let (owner, repo_name) = get_remote_info(&repo)?;

        let head_ref = repo.head().map_err(|e| format!("HEAD: {}", e))?;
        let branch = head_ref
            .shorthand()
            .ok_or("Cannot determine branch")?
            .to_string();

        (owner, repo_name, branch)
    };

    let token = auth::get_token()?
        .ok_or("Not authenticated. Please sign in with GitHub first.")?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "https://api.github.com/repos/{}/{}/pulls",
            owner, repo_name
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Workroot")
        .header("Accept", "application/vnd.github+json")
        .query(&[("head", format!("{}:{}", owner, head)), ("state", "open".to_string())])
        .send()
        .await
        .map_err(|e| format!("Failed to fetch PRs: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API error ({}): {}", status, body));
    }

    let prs: Vec<PullRequest> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse PRs: {}", e))?;

    Ok(prs.into_iter().next())
}

/// Get PR template content if it exists in the project.
#[tauri::command]
pub fn get_pr_template(
    db: State<'_, AppDb>,
    worktree_id: i64,
) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let base = std::path::Path::new(&worktree.path);

    // Check common locations for PR templates
    let template_paths = [
        ".github/PULL_REQUEST_TEMPLATE.md",
        ".github/pull_request_template.md",
        "PULL_REQUEST_TEMPLATE.md",
        "pull_request_template.md",
    ];

    for path in &template_paths {
        let full_path = base.join(path);
        if full_path.exists() {
            match std::fs::read_to_string(&full_path) {
                Ok(content) => return Ok(Some(content)),
                Err(_) => continue,
            }
        }
    }

    Ok(None)
}

/// Get the default branch (main or master) for the repo.
#[tauri::command]
pub fn get_default_branch(
    db: State<'_, AppDb>,
    worktree_id: i64,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    // Try common default branch names
    for name in &["main", "master"] {
        let refname = format!("refs/remotes/origin/{}", name);
        if repo.find_reference(&refname).is_ok() {
            return Ok(name.to_string());
        }
    }

    // Fall back to "main"
    Ok("main".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_https_remote() {
        let (owner, repo) =
            parse_github_remote("https://github.com/sauravpanda/workroot.git").unwrap();
        assert_eq!(owner, "sauravpanda");
        assert_eq!(repo, "workroot");
    }

    #[test]
    fn parse_https_no_git_suffix() {
        let (owner, repo) =
            parse_github_remote("https://github.com/owner/repo").unwrap();
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
    }

    #[test]
    fn parse_ssh_remote() {
        let (owner, repo) =
            parse_github_remote("git@github.com:owner/repo.git").unwrap();
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
    }

    #[test]
    fn parse_invalid_returns_none() {
        assert!(parse_github_remote("https://gitlab.com/owner/repo").is_none());
        assert!(parse_github_remote("not-a-url").is_none());
    }
}
