use super::auth;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubRepo {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub html_url: String,
    pub clone_url: String,
    pub language: Option<String>,
    pub pushed_at: Option<String>,
    pub private: bool,
}

/// Fetches the authenticated user's repositories from GitHub.
/// Handles pagination to retrieve all repos.
pub async fn list_user_repos() -> Result<Vec<GitHubRepo>, String> {
    let token = auth::get_token()?
        .ok_or_else(|| "Not authenticated. Please sign in with GitHub first.".to_string())?;

    let client = super::api_client()?;
    let mut all_repos = Vec::new();
    let mut page = 1u32;

    loop {
        let resp = client
            .get("https://api.github.com/user/repos")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "Workroot")
            .header("Accept", "application/vnd.github+json")
            .query(&[
                ("per_page", "100"),
                ("page", &page.to_string()),
                ("sort", "pushed"),
                ("affiliation", "owner,collaborator,organization_member"),
            ])
            .send()
            .await
            .map_err(|e| format!("Failed to fetch repos: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("GitHub API error: {}", resp.status()));
        }

        let repos: Vec<GitHubRepo> = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse repos: {}", e))?;

        if repos.is_empty() {
            break;
        }

        all_repos.extend(repos);
        page += 1;

        // Safety limit
        if page > 50 {
            break;
        }
    }

    Ok(all_repos)
}

/// Clones a GitHub repository to the specified local path.
pub fn clone_repo(clone_url: &str, target_path: &str, token: &str) -> Result<(), String> {
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
        git2::Cred::userpass_plaintext("x-access-token", token)
    });

    let mut fetch_options = git2::FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);

    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch_options);

    builder
        .clone(clone_url, std::path::Path::new(target_path))
        .map_err(|e| format!("Clone failed: {}", e))?;

    Ok(())
}
