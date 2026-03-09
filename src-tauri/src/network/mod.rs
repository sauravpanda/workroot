pub mod logging;
pub mod proxy;

use crate::db::AppDb;
use serde::Serialize;
use tauri::State;

/// Captured HTTP traffic entry.
#[derive(Debug, Serialize, Clone)]
pub struct TrafficEntry {
    pub process_id: Option<i64>,
    pub method: String,
    pub url: String,
    pub status_code: Option<u16>,
    pub request_headers: String,
    pub request_body: Option<String>,
    pub response_headers: Option<String>,
    pub response_body: Option<String>,
    pub duration_ms: Option<i64>,
}

/// Get recent network traffic.
#[tauri::command]
pub fn get_network_traffic(
    db: State<'_, AppDb>,
    method: Option<String>,
    url_pattern: Option<String>,
    status_min: Option<i64>,
    status_max: Option<i64>,
    limit: Option<i64>,
) -> Result<Vec<logging::TrafficRow>, String> {
    logging::get_traffic(
        &db,
        method.as_deref(),
        url_pattern.as_deref(),
        status_min,
        status_max,
        limit.unwrap_or(100),
    )
}

/// Search network traffic by URL.
#[tauri::command]
pub fn search_network_traffic(
    db: State<'_, AppDb>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<logging::TrafficRow>, String> {
    logging::search_traffic(&db, &query, limit.unwrap_or(100))
}

/// Get failed requests (4xx/5xx).
#[tauri::command]
pub fn get_failed_requests(
    db: State<'_, AppDb>,
    limit: Option<i64>,
) -> Result<Vec<logging::TrafficRow>, String> {
    logging::get_failed_requests(&db, limit.unwrap_or(50))
}

/// Clear old traffic entries.
#[tauri::command]
pub fn clear_network_traffic(db: State<'_, AppDb>) -> Result<usize, String> {
    logging::cleanup_old_traffic(&db, 0) // Delete all
}
