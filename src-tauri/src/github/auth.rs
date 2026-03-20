use super::{DeviceCodeResponse, GitHubUser};
use crate::db::AppDb;
use crate::settings;
use keyring::Entry;
use serde::Deserialize;
use tauri::State;

const KEYRING_SERVICE: &str = "com.workroot.app";
const KEYRING_USER: &str = "github_token";

/// Reads the GitHub Client ID from app settings.
fn get_client_id(db: &AppDb) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    settings::get_setting_value(&conn, "github_client_id")
        .ok_or_else(|| "GitHub Client ID not configured. Use a Personal Access Token instead — go to Settings > GitHub and paste your token.".to_string())
}

/// Stores a personal access token directly (no OAuth app needed).
/// Users can generate one at https://github.com/settings/tokens
pub fn store_pat(token: &str) -> Result<(), String> {
    store_token(token)
}

/// Attempts to read a GitHub token from the `gh` CLI config or environment.
/// Falls back to the OS keychain.
pub fn get_token_from_env_or_gh() -> Result<Option<String>, String> {
    // 1. Check OS keychain first (user may have already stored a token)
    if let Some(t) = get_token()? {
        return Ok(Some(t));
    }

    // 2. Check GH_TOKEN / GITHUB_TOKEN env vars
    if let Ok(token) = std::env::var("GH_TOKEN") {
        if !token.is_empty() {
            return Ok(Some(token));
        }
    }
    if let Ok(token) = std::env::var("GITHUB_TOKEN") {
        if !token.is_empty() {
            return Ok(Some(token));
        }
    }

    // 3. Try reading from `gh auth token` (GitHub CLI)
    match std::process::Command::new("gh")
        .args(["auth", "token"])
        .output()
    {
        Ok(output) if output.status.success() => {
            let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !token.is_empty() {
                return Ok(Some(token));
            }
        }
        _ => {}
    }

    Ok(None)
}

/// Starts the GitHub OAuth device code flow.
/// Returns a DeviceCodeResponse containing the user_code the user must enter
/// at the verification_uri.
pub async fn start_device_flow(db: State<'_, AppDb>) -> Result<DeviceCodeResponse, String> {
    let client_id = get_client_id(&db)?;
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("scope", "repo,user,gist"),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to start device flow: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "GitHub device code request failed ({}): {}",
            status, body
        ));
    }

    resp.json::<DeviceCodeResponse>()
        .await
        .map_err(|e| format!("Failed to parse device code response: {}", e))
}

#[derive(Deserialize)]
struct TokenPollResponse {
    access_token: Option<String>,
    error: Option<String>,
}

/// Polls GitHub for the access token after the user has entered the device code.
/// Returns the access token string on success.
pub async fn poll_for_token(
    db: State<'_, AppDb>,
    device_code: &str,
    interval: u64,
) -> Result<String, String> {
    let client_id = get_client_id(&db)?;
    let client = reqwest::Client::new();
    let poll_interval = std::time::Duration::from_secs(interval.max(5));
    let max_attempts = 120; // ~10 minutes at 5s interval

    for _ in 0..max_attempts {
        tokio::time::sleep(poll_interval).await;

        let resp = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id.as_str()),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("Poll request failed: {}", e))?;

        let poll: TokenPollResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse poll response: {}", e))?;

        if let Some(token) = poll.access_token {
            return Ok(token);
        }

        match poll.error.as_deref() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
            Some("expired_token") => return Err("Device code expired. Please try again.".into()),
            Some("access_denied") => return Err("Authorization was denied by the user.".into()),
            Some(err) => return Err(format!("GitHub OAuth error: {}", err)),
            None => continue,
        }
    }

    Err("Polling timed out. Please try again.".into())
}

/// Stores the GitHub access token in the OS keychain.
pub fn store_token(token: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    entry
        .set_password(token)
        .map_err(|e| format!("Failed to store token in keychain: {}", e))
}

/// Retrieves the GitHub access token from the OS keychain.
/// Returns None if no token is stored.
pub fn get_token() -> Result<Option<String>, String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve token from keychain: {}", e)),
    }
}

/// Removes the GitHub access token from the OS keychain.
pub fn delete_token() -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already gone, that's fine
        Err(e) => Err(format!("Failed to delete token from keychain: {}", e)),
    }
}

/// Fetches the authenticated user's profile from GitHub using any available token.
pub async fn get_authenticated_user() -> Result<Option<GitHubUser>, String> {
    let token = match get_token_from_env_or_gh()? {
        Some(t) => t,
        None => return Ok(None),
    };

    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Workroot")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user profile: {}", e))?;

    if !resp.status().is_success() {
        // Token might be invalid/revoked — clear it
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            let _ = delete_token();
            return Ok(None);
        }
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    let user: GitHubUser = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse user response: {}", e))?;

    Ok(Some(user))
}
