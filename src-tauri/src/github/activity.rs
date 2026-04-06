use super::auth;
use crate::db::queries;
use crate::db::AppDb;
use git2::Repository;
use serde::{Deserialize, Serialize};
use tauri::State;

// ============================================================
// Public response structs
// ============================================================

#[derive(Debug, Serialize)]
pub struct LabelInfo {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize)]
pub struct RepoPull {
    pub number: i64,
    pub title: String,
    pub html_url: String,
    pub state: String,
    pub draft: bool,
    pub user_login: String,
    pub updated_at: String,
    pub head_branch: String,
    pub labels: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct RepoIssue {
    pub number: i64,
    pub title: String,
    pub html_url: String,
    pub state: String,
    pub user_login: String,
    pub updated_at: String,
    pub labels: Vec<LabelInfo>,
}

#[derive(Debug, Serialize)]
pub struct RepoEvent {
    pub id: String,
    pub event_type: String,
    pub actor_login: String,
    pub created_at: String,
    pub payload_action: Option<String>,
    pub payload_title: Option<String>,
    pub payload_number: Option<i64>,
}

// ============================================================
// Internal API response structs
// ============================================================

#[derive(Deserialize)]
struct PullApi {
    number: i64,
    title: String,
    html_url: String,
    state: String,
    draft: Option<bool>,
    user: UserApi,
    updated_at: String,
    head: HeadApi,
    labels: Vec<LabelApi>,
}

#[derive(Deserialize)]
struct HeadApi {
    #[serde(rename = "ref")]
    ref_name: String,
}

#[derive(Deserialize)]
struct IssueApi {
    number: i64,
    title: String,
    html_url: String,
    state: String,
    user: UserApi,
    updated_at: String,
    labels: Vec<LabelApi>,
    pull_request: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct LabelApi {
    name: String,
    color: String,
}

#[derive(Deserialize)]
struct UserApi {
    login: String,
}

#[derive(Deserialize)]
struct EventApi {
    id: String,
    #[serde(rename = "type")]
    event_type: String,
    actor: ActorApi,
    created_at: String,
    payload: Option<PayloadApi>,
}

#[derive(Deserialize)]
struct ActorApi {
    login: String,
}

#[derive(Deserialize)]
struct PayloadApi {
    action: Option<String>,
    pull_request: Option<PayloadPr>,
    issue: Option<PayloadIssue>,
}

#[derive(Deserialize)]
struct PayloadPr {
    title: String,
    number: i64,
}

#[derive(Deserialize)]
struct PayloadIssue {
    title: String,
    number: i64,
}

// ============================================================
// Helpers
// ============================================================

fn parse_github_remote(url: &str) -> Option<(String, String)> {
    let url = url.trim();
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
    if let Some(rest) = url.strip_prefix("git@github.com:") {
        let rest = rest.trim_end_matches(".git");
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    None
}

fn get_project_remote(db: &AppDb, project_id: i64) -> Result<(String, String), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let project = queries::get_project(&conn, project_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Project not found")?;

    let repo = Repository::open(&project.local_path).map_err(|e| format!("Git: {}", e))?;
    let remote = repo
        .find_remote("origin")
        .map_err(|e| format!("No origin remote: {}", e))?;
    let url = remote.url().ok_or("Remote URL is not valid UTF-8")?;
    parse_github_remote(url).ok_or_else(|| format!("Cannot parse GitHub remote from: {}", url))
}

async fn fetch_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    token: Option<&str>,
    url: &str,
) -> Result<T, String> {
    let mut req = client
        .get(url)
        .header("User-Agent", "Workroot")
        .header("Accept", "application/vnd.github+json");

    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {}", t));
    }

    let resp = req
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

// ============================================================
// Tauri commands
// ============================================================

/// List open pull requests for a project's GitHub repo.
/// Works without auth for public repos; uses token when available for higher rate limits.
#[tauri::command]
pub async fn list_repo_pulls(
    db: State<'_, AppDb>,
    project_id: i64,
) -> Result<Vec<RepoPull>, String> {
    let (owner, repo_name) = get_project_remote(&db, project_id)?;
    let token = auth::get_token_from_env_or_gh()?.unwrap_or_default();
    let token_ref = if token.is_empty() { None } else { Some(token.as_str()) };

    let client = super::api_client()?;
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls?state=open&per_page=25&sort=updated",
        owner, repo_name
    );

    let pulls: Vec<PullApi> = fetch_json(&client, token_ref, &url).await?;

    Ok(pulls
        .into_iter()
        .map(|p| RepoPull {
            number: p.number,
            title: p.title,
            html_url: p.html_url,
            state: p.state,
            draft: p.draft.unwrap_or(false),
            user_login: p.user.login,
            updated_at: p.updated_at,
            head_branch: p.head.ref_name,
            labels: p.labels.into_iter().map(|l| l.name).collect(),
        })
        .collect())
}

/// List open issues (excluding PRs) for a project's GitHub repo.
/// Works without auth for public repos; uses token when available for higher rate limits.
#[tauri::command]
pub async fn list_repo_issues(
    db: State<'_, AppDb>,
    project_id: i64,
) -> Result<Vec<RepoIssue>, String> {
    let (owner, repo_name) = get_project_remote(&db, project_id)?;
    let token = auth::get_token_from_env_or_gh()?.unwrap_or_default();
    let token_ref = if token.is_empty() { None } else { Some(token.as_str()) };

    let client = super::api_client()?;
    let url = format!(
        "https://api.github.com/repos/{}/{}/issues?state=open&per_page=25&sort=updated&direction=desc",
        owner, repo_name
    );

    let issues: Vec<IssueApi> = fetch_json(&client, token_ref, &url).await?;

    // GitHub's issues endpoint includes PRs — filter them out
    Ok(issues
        .into_iter()
        .filter(|i| i.pull_request.is_none())
        .map(|i| RepoIssue {
            number: i.number,
            title: i.title,
            html_url: i.html_url,
            state: i.state,
            user_login: i.user.login,
            updated_at: i.updated_at,
            labels: i
                .labels
                .into_iter()
                .map(|l| LabelInfo {
                    name: l.name,
                    color: l.color,
                })
                .collect(),
        })
        .collect())
}

/// Get recent repository events for a project's GitHub repo.
/// Works without auth for public repos; uses token when available for higher rate limits.
#[tauri::command]
pub async fn get_repo_activity(
    db: State<'_, AppDb>,
    project_id: i64,
) -> Result<Vec<RepoEvent>, String> {
    let (owner, repo_name) = get_project_remote(&db, project_id)?;
    let token = auth::get_token_from_env_or_gh()?.unwrap_or_default();
    let token_ref = if token.is_empty() { None } else { Some(token.as_str()) };

    let client = super::api_client()?;
    let url = format!(
        "https://api.github.com/repos/{}/{}/events?per_page=20",
        owner, repo_name
    );

    let events: Vec<EventApi> = fetch_json(&client, token_ref, &url).await?;

    Ok(events
        .into_iter()
        .map(|e| {
            let (payload_action, payload_title, payload_number) = match e.payload {
                Some(p) => {
                    let action = p.action;
                    let (title, number) = if let Some(pr) = p.pull_request {
                        (Some(pr.title), Some(pr.number))
                    } else if let Some(issue) = p.issue {
                        (Some(issue.title), Some(issue.number))
                    } else {
                        (None, None)
                    };
                    (action, title, number)
                }
                None => (None, None, None),
            };

            RepoEvent {
                id: e.id,
                event_type: e.event_type,
                actor_login: e.actor.login,
                created_at: e.created_at,
                payload_action,
                payload_title,
                payload_number,
            }
        })
        .collect())
}
