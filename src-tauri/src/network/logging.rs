use super::TrafficEntry;
use crate::db::AppDb;
use rusqlite::params;
use serde::Serialize;

/// Stored traffic row.
#[derive(Debug, Serialize)]
pub struct TrafficRow {
    pub id: i64,
    pub process_id: Option<i64>,
    pub method: String,
    pub url: String,
    pub status_code: Option<i64>,
    pub request_headers: Option<String>,
    pub request_body: Option<String>,
    pub response_headers: Option<String>,
    pub response_body: Option<String>,
    pub duration_ms: Option<i64>,
    pub timestamp: String,
}

/// Log a traffic entry to the database.
pub fn log_traffic(db: &AppDb, entry: &TrafficEntry) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO network_traffic (process_id, method, url, status_code, request_headers, request_body, response_headers, response_body, duration_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            entry.process_id,
            entry.method,
            entry.url,
            entry.status_code.map(|s| s as i64),
            entry.request_headers,
            entry.request_body,
            entry.response_headers,
            entry.response_body,
            entry.duration_ms,
        ],
    )
    .map_err(|e| format!("Insert traffic: {}", e))?;

    Ok(conn.last_insert_rowid())
}

/// Get recent traffic entries, optionally filtered.
pub fn get_traffic(
    db: &AppDb,
    method: Option<&str>,
    url_pattern: Option<&str>,
    status_min: Option<i64>,
    status_max: Option<i64>,
    limit: i64,
) -> Result<Vec<TrafficRow>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let mut sql = String::from(
        "SELECT id, process_id, method, url, status_code, request_headers, request_body,
                response_headers, response_body, duration_ms, timestamp
         FROM network_traffic WHERE 1=1",
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(m) = method {
        sql.push_str(&format!(" AND method = ?{}", param_idx));
        param_values.push(Box::new(m.to_string()));
        param_idx += 1;
    }

    if let Some(pattern) = url_pattern {
        sql.push_str(&format!(" AND url LIKE ?{}", param_idx));
        param_values.push(Box::new(format!("%{}%", pattern)));
        param_idx += 1;
    }

    if let Some(min) = status_min {
        sql.push_str(&format!(" AND status_code >= ?{}", param_idx));
        param_values.push(Box::new(min));
        param_idx += 1;
    }

    if let Some(max) = status_max {
        sql.push_str(&format!(" AND status_code <= ?{}", param_idx));
        param_values.push(Box::new(max));
        param_idx += 1;
    }

    sql.push_str(&format!(" ORDER BY timestamp DESC LIMIT ?{}", param_idx));
    param_values.push(Box::new(limit));

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query: {}", e))?;
    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(TrafficRow {
                id: row.get(0)?,
                process_id: row.get(1)?,
                method: row.get(2)?,
                url: row.get(3)?,
                status_code: row.get(4)?,
                request_headers: row.get(5)?,
                request_body: row.get(6)?,
                response_headers: row.get(7)?,
                response_body: row.get(8)?,
                duration_ms: row.get(9)?,
                timestamp: row.get(10)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    Ok(results)
}

/// Search traffic by URL pattern.
pub fn search_traffic(db: &AppDb, query: &str, limit: i64) -> Result<Vec<TrafficRow>, String> {
    get_traffic(db, None, Some(query), None, None, limit)
}

/// Get failed requests (4xx and 5xx).
pub fn get_failed_requests(db: &AppDb, limit: i64) -> Result<Vec<TrafficRow>, String> {
    get_traffic(db, None, None, Some(400), None, limit)
}

/// Delete traffic entries older than the given hours.
pub fn cleanup_old_traffic(db: &AppDb, hours: i64) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let deleted = conn
        .execute(
            "DELETE FROM network_traffic WHERE timestamp < datetime('now', ?1)",
            params![format!("-{} hours", hours)],
        )
        .map_err(|e| format!("Cleanup: {}", e))?;
    Ok(deleted)
}
