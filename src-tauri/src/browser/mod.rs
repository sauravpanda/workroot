pub mod correlate;

use serde::{Deserialize, Serialize};

/// Browser error event received from the Chrome extension.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BrowserError {
    #[serde(rename = "type")]
    pub error_type: String,
    pub message: String,
    pub source: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub stack: Option<String>,
    pub timestamp: String,
    pub page_url: String,
    pub tab_url: Option<String>,
    pub user_agent: Option<String>,
}

/// Network failure event received from the Chrome extension.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkFailure {
    pub url: String,
    pub method: String,
    pub status_code: u16,
    pub response_body: Option<String>,
    pub request_body: Option<String>,
    pub duration_ms: Option<i64>,
    pub timestamp: String,
    pub page_url: Option<String>,
    pub tab_url: Option<String>,
}

/// Stored browser event.
#[derive(Debug, Serialize)]
pub struct BrowserEvent {
    pub id: i64,
    pub event_type: String,
    pub message: String,
    pub url: Option<String>,
    pub status_code: Option<i64>,
    pub details: String,
    pub timestamp: String,
}

/// Correlated view: browser event + related server logs.
#[derive(Debug, Serialize)]
pub struct CorrelatedEvent {
    pub browser_event: BrowserEvent,
    pub server_logs: Vec<RelatedLog>,
}

/// A server log related to a browser event.
#[derive(Debug, Serialize)]
pub struct RelatedLog {
    pub process_id: i64,
    pub stream: String,
    pub content: String,
    pub timestamp: String,
}
