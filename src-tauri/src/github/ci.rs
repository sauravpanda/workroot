use super::auth;
use super::pr;
use crate::db::queries;
use crate::db::AppDb;
use git2::Repository;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckRun {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub html_url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Review {
    pub user: String,
    pub state: String,
    pub submitted_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PrStatus {
    pub number: i64,
    pub title: String,
    pub html_url: String,
    pub state: String,
    pub draft: bool,
    pub mergeable: Option<bool>,
    pub mergeable_state: Option<String>,
    pub checks: Vec<CheckRun>,
    pub reviews: Vec<Review>,
    pub additions: Option<i64>,
    pub deletions: Option<i64>,
    pub changed_files: Option<i64>,
}

#[derive(Deserialize)]
struct PrDetail {
    number: i64,
    title: String,
    html_url: String,
    state: String,
    draft: Option<bool>,
    mergeable: Option<bool>,
    mergeable_state: Option<String>,
    additions: Option<i64>,
    deletions: Option<i64>,
    changed_files: Option<i64>,
}

#[derive(Deserialize)]
struct CheckRunsResponse {
    check_runs: Vec<CheckRunApi>,
}

#[derive(Deserialize)]
struct CheckRunApi {
    name: String,
    status: String,
    conclusion: Option<String>,
    html_url: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Deserialize)]
struct ReviewApi {
    user: ReviewUser,
    state: String,
    submitted_at: Option<String>,
}

#[derive(Deserialize)]
struct ReviewUser {
    login: String,
}

/// Get full PR status including checks and reviews.
#[tauri::command]
pub async fn get_pr_status(
    db: State<'_, AppDb>,
    worktree_id: i64,
) -> Result<Option<PrStatus>, String> {
    // First check if there's an existing PR
    let existing = pr::get_pr_for_branch(db.clone(), worktree_id).await?;
    let existing = match existing {
        Some(pr) => pr,
        None => return Ok(None),
    };

    let (owner, repo_name) = {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
        let worktree = queries::get_worktree(&conn, worktree_id)
            .map_err(|e| format!("DB: {}", e))?
            .ok_or("Worktree not found")?;

        let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;
        let remote = repo
            .find_remote("origin")
            .map_err(|e| format!("Remote: {}", e))?;
        let url = remote
            .url()
            .ok_or("Remote URL not valid UTF-8")?
            .to_string();
        parse_owner_repo(&url)?
    };

    let token = auth::get_token()?.ok_or("Not authenticated. Please sign in with GitHub first.")?;

    let client = reqwest::Client::new();

    // Fetch PR detail, checks, and reviews in parallel
    let pr_url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{}",
        owner, repo_name, existing.number
    );
    let reviews_url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{}/reviews",
        owner, repo_name, existing.number
    );

    let (pr_resp, checks_resp, reviews_resp) = tokio::join!(
        fetch_json::<PrDetail>(&client, &token, &pr_url),
        fetch_check_runs(&client, &token, &owner, &repo_name, existing.number),
        fetch_reviews(&client, &token, &reviews_url),
    );

    let pr_detail = pr_resp?;
    let checks = checks_resp.unwrap_or_default();
    let reviews = reviews_resp.unwrap_or_default();

    Ok(Some(PrStatus {
        number: pr_detail.number,
        title: pr_detail.title,
        html_url: pr_detail.html_url,
        state: pr_detail.state,
        draft: pr_detail.draft.unwrap_or(false),
        mergeable: pr_detail.mergeable,
        mergeable_state: pr_detail.mergeable_state,
        checks,
        reviews,
        additions: pr_detail.additions,
        deletions: pr_detail.deletions,
        changed_files: pr_detail.changed_files,
    }))
}

fn parse_owner_repo(url: &str) -> Result<(String, String), String> {
    let url = url.trim();
    if let Some(rest) = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
    {
        let rest = rest.trim_end_matches(".git");
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
    }
    if let Some(rest) = url.strip_prefix("git@github.com:") {
        let rest = rest.trim_end_matches(".git");
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
    }
    Err(format!("Cannot parse GitHub remote: {}", url))
}

async fn fetch_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    token: &str,
    url: &str,
) -> Result<T, String> {
    let resp = client
        .get(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Workroot")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API error ({}): {}", status, body));
    }

    resp.json()
        .await
        .map_err(|e| format!("Parse failed: {}", e))
}

async fn fetch_check_runs(
    client: &reqwest::Client,
    token: &str,
    owner: &str,
    repo: &str,
    pr_number: i64,
) -> Result<Vec<CheckRun>, String> {
    // Get the PR's head SHA first
    let pr_url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{}",
        owner, repo, pr_number
    );

    #[derive(Deserialize)]
    struct PrHead {
        head: PrHeadRef,
    }
    #[derive(Deserialize)]
    struct PrHeadRef {
        sha: String,
    }

    let pr_head: PrHead = fetch_json(client, token, &pr_url).await?;

    let checks_url = format!(
        "https://api.github.com/repos/{}/{}/commits/{}/check-runs",
        owner, repo, pr_head.head.sha
    );

    let runs: CheckRunsResponse = fetch_json(client, token, &checks_url).await?;

    Ok(runs
        .check_runs
        .into_iter()
        .map(|r| CheckRun {
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
            html_url: r.html_url,
            started_at: r.started_at,
            completed_at: r.completed_at,
        })
        .collect())
}

async fn fetch_reviews(
    client: &reqwest::Client,
    token: &str,
    url: &str,
) -> Result<Vec<Review>, String> {
    let reviews: Vec<ReviewApi> = fetch_json(client, token, url).await?;

    Ok(reviews
        .into_iter()
        .map(|r| Review {
            user: r.user.login,
            state: r.state,
            submitted_at: r.submitted_at,
        })
        .collect())
}
