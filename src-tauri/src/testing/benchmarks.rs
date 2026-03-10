use crate::db::AppDb;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct BenchmarkEntry {
    pub id: i64,
    pub cwd: String,
    pub metric_name: String,
    pub value: f64,
    pub unit: String,
    pub created_at: String,
}

/// Record a benchmark measurement.
#[tauri::command]
pub fn record_benchmark(
    db: State<'_, AppDb>,
    cwd: String,
    metric_name: String,
    value: f64,
    unit: String,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    conn.execute(
        "INSERT INTO benchmarks (cwd, metric_name, value, unit) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![cwd, metric_name, value, unit],
    )
    .map_err(|e| format!("Insert benchmark: {}", e))?;

    Ok(conn.last_insert_rowid())
}

/// Get benchmark history for a specific metric.
#[tauri::command]
pub fn get_benchmark_history(
    db: State<'_, AppDb>,
    cwd: String,
    metric_name: String,
    limit: Option<i64>,
) -> Result<Vec<BenchmarkEntry>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let limit = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT id, cwd, metric_name, value, unit, created_at
             FROM benchmarks
             WHERE cwd = ?1 AND metric_name = ?2
             ORDER BY id DESC
             LIMIT ?3",
        )
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![cwd, metric_name, limit], |row| {
            Ok(BenchmarkEntry {
                id: row.get(0)?,
                cwd: row.get(1)?,
                metric_name: row.get(2)?,
                value: row.get(3)?,
                unit: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("Row: {}", e))?);
    }

    Ok(entries)
}
