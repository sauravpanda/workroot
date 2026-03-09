use crate::db::AppDb;
use rusqlite::params;
use serde::Serialize;

/// A hot file with its change count.
#[derive(Debug, Serialize)]
pub struct HotFile {
    pub file_path: String,
    pub change_count: i64,
}

/// Files that co-change with a given file.
#[derive(Debug, Serialize)]
pub struct CoChange {
    pub file_path: String,
    pub co_change_count: i64,
}

/// Get the most frequently changed files in a time period.
pub fn get_hot_files(db: &AppDb, project_id: i64, period: &str) -> Result<Vec<HotFile>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let time_clause = match period {
        "1h" => "datetime('now', '-1 hour')",
        "24h" => "datetime('now', '-1 day')",
        "7d" => "datetime('now', '-7 days')",
        _ => "datetime('now', '-1 day')",
    };

    let sql = format!(
        "SELECT file_path, COUNT(*) as cnt FROM file_events
         WHERE project_id = ?1 AND timestamp >= {}
         GROUP BY file_path ORDER BY cnt DESC LIMIT 20",
        time_clause
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query: {}", e))?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(HotFile {
                file_path: row.get(0)?,
                change_count: row.get(1)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    Ok(results)
}

/// Find files that co-change with a given file (within 5-minute windows).
pub fn get_co_changes(
    db: &AppDb,
    project_id: i64,
    file_path: &str,
) -> Result<Vec<CoChange>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Find files that have events within 5 minutes of events for the target file
    let mut stmt = conn
        .prepare(
            "SELECT f2.file_path, COUNT(*) as cnt
             FROM file_events f1
             JOIN file_events f2 ON f1.project_id = f2.project_id
                AND f2.file_path != f1.file_path
                AND f2.timestamp BETWEEN datetime(f1.timestamp, '-5 minutes')
                    AND datetime(f1.timestamp, '+5 minutes')
             WHERE f1.project_id = ?1 AND f1.file_path = ?2
             GROUP BY f2.file_path
             ORDER BY cnt DESC
             LIMIT 20",
        )
        .map_err(|e| format!("Query: {}", e))?;

    let rows = stmt
        .query_map(params![project_id, file_path], |row| {
            Ok(CoChange {
                file_path: row.get(0)?,
                co_change_count: row.get(1)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    Ok(results)
}

/// Get change frequency for a specific file.
pub fn get_change_frequency(db: &AppDb, project_id: i64, file_path: &str) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.query_row(
        "SELECT COUNT(*) FROM file_events WHERE project_id = ?1 AND file_path = ?2",
        params![project_id, file_path],
        |row| row.get(0),
    )
    .map_err(|e| format!("Query: {}", e))
}
