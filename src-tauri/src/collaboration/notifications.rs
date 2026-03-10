use crate::github::auth;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Notification {
    pub id: String,
    pub reason: String,
    pub subject_title: String,
    pub subject_type: String,
    pub repo_name: String,
    pub updated_at: String,
    pub unread: bool,
    pub url: Option<String>,
}

/// Fetch GitHub notifications for the authenticated user.
#[tauri::command]
pub async fn get_notifications() -> Result<Vec<Notification>, String> {
    let token = auth::get_token()?.ok_or_else(|| "Not authenticated".to_string())?;

    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/notifications?per_page=30")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Workroot")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Fetch notifications: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse notifications: {}", e))?;

    let items = body.as_array().ok_or("Expected array response")?;
    let mut notifications = Vec::new();

    for item in items {
        let subject = item.get("subject").unwrap_or(&serde_json::Value::Null);
        let repo = item.get("repository").unwrap_or(&serde_json::Value::Null);

        notifications.push(Notification {
            id: item
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            reason: item
                .get("reason")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            subject_title: subject
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            subject_type: subject
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            repo_name: repo
                .get("full_name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            updated_at: item
                .get("updated_at")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            unread: item
                .get("unread")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            url: subject
                .get("url")
                .and_then(|v| v.as_str())
                .map(String::from),
        });
    }

    Ok(notifications)
}

/// Mark a single notification thread as read.
#[tauri::command]
pub async fn mark_notification_read(thread_id: String) -> Result<(), String> {
    let token = auth::get_token()?.ok_or_else(|| "Not authenticated".to_string())?;

    let client = reqwest::Client::new();
    let resp = client
        .patch(format!(
            "https://api.github.com/notifications/threads/{}",
            thread_id
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Workroot")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Mark notification read: {}", e))?;

    if !resp.status().is_success() && resp.status() != reqwest::StatusCode::RESET_CONTENT {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    Ok(())
}
