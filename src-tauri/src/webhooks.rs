use crate::db::AppDb;
use axum::{
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use rusqlite::params;
use serde::Serialize;
use serde_json::Value;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize)]
pub struct WebhookEvent {
    pub id: i64,
    pub source: String,
    pub event_type: String,
    pub payload: String,
    pub received_at: String,
}

#[derive(Debug, Serialize, serde::Deserialize)]
pub struct WebhookConfig {
    pub enabled: bool,
    pub port: u16,
    pub secret: Option<String>,
}

/// Lists recent webhook events from the database.
#[tauri::command]
pub fn get_webhook_events(
    db: tauri::State<'_, AppDb>,
    limit: Option<i64>,
) -> Result<Vec<WebhookEvent>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let limit = limit.unwrap_or(100);
    let mut stmt = conn
        .prepare(
            "SELECT id, source, event_type, payload, received_at FROM webhook_events ORDER BY received_at DESC LIMIT ?1",
        )
        .map_err(|e| format!("Query: {}", e))?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(WebhookEvent {
                id: row.get(0)?,
                source: row.get(1)?,
                event_type: row.get(2)?,
                payload: row.get(3)?,
                received_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    Ok(results)
}

/// Clears all webhook events from the database.
#[tauri::command]
pub fn clear_webhook_events(db: tauri::State<'_, AppDb>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute("DELETE FROM webhook_events", [])
        .map_err(|e| format!("Failed to clear webhook events: {}", e))?;
    Ok(())
}

/// Reads webhook configuration from the settings table.
#[tauri::command]
pub fn get_webhook_config(db: tauri::State<'_, AppDb>) -> Result<WebhookConfig, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let enabled = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'webhook_enabled'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "true".to_string());

    let port = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'webhook_port'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "9999".to_string());

    let secret = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'webhook_secret'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok();

    Ok(WebhookConfig {
        enabled: enabled == "true",
        port: port.parse().unwrap_or(9999),
        secret,
    })
}

/// Starts an axum HTTP server on port 9999 to receive webhooks.
pub async fn start_webhook_server(app_handle: AppHandle) {
    let app = Arc::new(app_handle);

    let app_for_webhook = app.clone();
    let webhook_handler = post(move |headers: HeaderMap, body: String| {
        let app = app_for_webhook.clone();
        async move { handle_webhook(app, headers, body).await }
    });

    let health_handler = get(|| async { (StatusCode::OK, "OK") });

    let router = Router::new()
        .route("/webhook", webhook_handler)
        .route("/health", health_handler);

    let addr = SocketAddr::from(([127, 0, 0, 1], 9999));

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!(
                "Workroot webhook server: port 9999 already in use, not started: {}",
                e
            );
            return;
        }
    };

    eprintln!("Workroot webhook server listening on http://127.0.0.1:9999");

    if let Err(e) = axum::serve(listener, router).await {
        eprintln!("Webhook server error: {}", e);
    }
}

/// Handles an incoming webhook POST request.
async fn handle_webhook(
    app: Arc<AppHandle>,
    headers: HeaderMap,
    body: String,
) -> impl IntoResponse {
    // Extract source from X-GitHub-Event header or default to "unknown"
    let source = headers
        .get("x-github-event")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "unknown".to_string());

    // Extract event_type: from the header if present, otherwise from $.action in JSON body
    let event_type =
        if let Some(gh_event) = headers.get("x-github-event").and_then(|v| v.to_str().ok()) {
            gh_event.to_string()
        } else {
            // Try to parse action from JSON body
            serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| {
                    v.get("action")
                        .and_then(|a| a.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| "unknown".to_string())
        };

    // Store in database
    let db = app.state::<AppDb>();
    let store_result = {
        let conn = match db.0.lock() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Webhook DB lock error: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal error".to_string(),
                );
            }
        };
        conn.execute(
            "INSERT INTO webhook_events (source, event_type, payload) VALUES (?1, ?2, ?3)",
            params![source, event_type, body],
        )
    };

    if let Err(e) = store_result {
        eprintln!("Webhook store error: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to store event".to_string(),
        );
    }

    // Emit Tauri event
    let _ = app.emit(
        "webhook:received",
        serde_json::json!({
            "source": source,
            "event_type": event_type,
        }),
    );

    (StatusCode::OK, "Webhook received".to_string())
}
