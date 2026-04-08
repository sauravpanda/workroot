use crate::db::AppDb;
use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct BenchmarkEntry {
    pub metric_name: String,
    pub value: f64,
    pub unit: String,
    pub timestamp: String,
}

fn record_benchmark_entry(
    conn: &Connection,
    cwd: &str,
    metric_name: &str,
    value: f64,
    unit: &str,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO benchmarks (cwd, metric_name, value, unit) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![cwd, metric_name, value, unit],
    )
    .map_err(|e| format!("Insert benchmark: {}", e))?;

    Ok(conn.last_insert_rowid())
}

fn list_benchmark_metrics_for_cwd(conn: &Connection, cwd: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT metric_name
             FROM benchmarks
             WHERE cwd = ?1
             GROUP BY metric_name
             ORDER BY metric_name COLLATE NOCASE ASC",
        )
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows = stmt
        .query_map([cwd], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Query: {}", e))?;

    let mut metrics = Vec::new();
    for row in rows {
        metrics.push(row.map_err(|e| format!("Row: {}", e))?);
    }

    Ok(metrics)
}

fn get_benchmark_history_for_metric(
    conn: &Connection,
    cwd: &str,
    metric_name: &str,
    limit: i64,
) -> Result<Vec<BenchmarkEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT metric_name, value, unit, created_at
             FROM benchmarks
             WHERE cwd = ?1 AND metric_name = ?2
             ORDER BY id DESC
             LIMIT ?3",
        )
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![cwd, metric_name, limit], |row| {
            Ok(BenchmarkEntry {
                metric_name: row.get(0)?,
                value: row.get(1)?,
                unit: row.get(2)?,
                timestamp: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    entries.reverse();

    Ok(entries)
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
    record_benchmark_entry(&conn, &cwd, &metric_name, value, &unit)
}

/// List distinct benchmark metric names for a workspace.
#[tauri::command]
pub fn list_benchmark_metrics(db: State<'_, AppDb>, cwd: String) -> Result<Vec<String>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    list_benchmark_metrics_for_cwd(&conn, &cwd)
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
    get_benchmark_history_for_metric(&conn, &cwd, &metric_name, limit)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_test_db;

    #[test]
    fn lists_distinct_metrics_for_a_workspace() {
        let conn = init_test_db();

        record_benchmark_entry(&conn, "/repo-a", "latency", 18.4, "ms").unwrap();
        record_benchmark_entry(&conn, "/repo-a", "throughput", 102.0, "ops/s").unwrap();
        record_benchmark_entry(&conn, "/repo-a", "latency", 17.9, "ms").unwrap();
        record_benchmark_entry(&conn, "/repo-b", "latency", 88.0, "ms").unwrap();

        let metrics = list_benchmark_metrics_for_cwd(&conn, "/repo-a").unwrap();

        assert_eq!(
            metrics,
            vec!["latency".to_string(), "throughput".to_string()]
        );
    }

    #[test]
    fn returns_history_in_chronological_order_with_timestamp_field() {
        let conn = init_test_db();

        let first_id = record_benchmark_entry(&conn, "/repo-a", "latency", 12.5, "ms").unwrap();
        let second_id = record_benchmark_entry(&conn, "/repo-a", "latency", 15.0, "ms").unwrap();

        let history = get_benchmark_history_for_metric(&conn, "/repo-a", "latency", 10).unwrap();

        assert_eq!(history.len(), 2);
        assert_eq!(history[0].value, 12.5);
        assert_eq!(history[1].value, 15.0);

        let payload = serde_json::to_value(&history[0]).unwrap();
        assert_eq!(payload.get("metric_name").unwrap(), "latency");
        assert_eq!(payload.get("value").unwrap(), &serde_json::json!(12.5));
        assert_eq!(payload.get("unit").unwrap(), "ms");
        assert!(payload.get("timestamp").is_some());
        assert!(payload.get("created_at").is_none());

        let ids: Vec<i64> = conn
            .prepare(
                "SELECT id FROM benchmarks WHERE cwd = ?1 AND metric_name = ?2 ORDER BY id ASC",
            )
            .unwrap()
            .query_map(rusqlite::params!["/repo-a", "latency"], |row| row.get(0))
            .unwrap()
            .map(|row| row.unwrap())
            .collect();
        assert_eq!(ids, vec![first_id, second_id]);
    }
}
