use crate::db::AppDb;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct FlakyTest {
    pub test_name: String,
    pub total_runs: i64,
    pub failures: i64,
    pub flakiness_pct: f64,
    pub last_status: String,
}

/// Record a single test result for flaky-test tracking.
#[tauri::command]
pub fn record_test_result(
    db: State<'_, AppDb>,
    cwd: String,
    test_name: String,
    status: String,
    duration_ms: Option<i64>,
    run_id: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO test_results (cwd, test_name, status, duration_ms, run_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![cwd, test_name, status, duration_ms, run_id],
    )
    .map_err(|e| format!("Insert test result: {}", e))?;

    // Prune: keep only the most recent 100 runs per (cwd, test_name)
    conn.execute(
        "DELETE FROM test_results WHERE id IN (
            SELECT id FROM test_results
            WHERE cwd = ?1 AND test_name = ?2
            ORDER BY id DESC
            LIMIT -1 OFFSET 100
        )",
        params![cwd, test_name],
    )
    .map_err(|e| format!("Prune test results: {}", e))?;

    Ok(())
}

/// Get tests that have both passes and failures in the last 20 runs, indicating flakiness.
#[tauri::command]
pub fn get_flaky_tests(db: State<'_, AppDb>, cwd: String) -> Result<Vec<FlakyTest>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let mut stmt = conn
        .prepare(
            "WITH recent AS (
                SELECT test_name, status,
                       ROW_NUMBER() OVER (PARTITION BY test_name ORDER BY id DESC) AS rn
                FROM test_results
                WHERE cwd = ?1
            ),
            last_20 AS (
                SELECT test_name, status FROM recent WHERE rn <= 20
            ),
            stats AS (
                SELECT
                    test_name,
                    COUNT(*) AS total_runs,
                    SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) AS failures,
                    SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passes
                FROM last_20
                GROUP BY test_name
                HAVING failures > 0 AND passes > 0
            )
            SELECT
                s.test_name,
                s.total_runs,
                s.failures,
                ROUND(CAST(s.failures AS REAL) / s.total_runs * 100, 1) AS flakiness_pct,
                (SELECT status FROM recent WHERE test_name = s.test_name AND rn = 1) AS last_status
            FROM stats s
            ORDER BY flakiness_pct DESC",
        )
        .map_err(|e| format!("Prepare flaky query: {}", e))?;

    let rows = stmt
        .query_map(params![cwd], |row| {
            Ok(FlakyTest {
                test_name: row.get(0)?,
                total_runs: row.get(1)?,
                failures: row.get(2)?,
                flakiness_pct: row.get(3)?,
                last_status: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query flaky tests: {}", e))?;

    let mut tests = Vec::new();
    for row in rows {
        tests.push(row.map_err(|e| format!("Row: {}", e))?);
    }

    Ok(tests)
}

#[cfg(test)]
mod tests {
    use crate::db::init_test_db;
    use rusqlite::params;

    #[test]
    fn test_results_table_exists() {
        let conn = init_test_db();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='test_results'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "test_results table should exist");
    }

    #[test]
    fn test_results_index_exists() {
        let conn = init_test_db();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_test_results_lookup'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "idx_test_results_lookup should exist");
    }

    #[test]
    fn insert_and_query_test_results() {
        let conn = init_test_db();

        conn.execute(
            "INSERT INTO test_results (cwd, test_name, status, duration_ms, run_id) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["/app", "test_login", "passed", 120, "run-1"],
        )
        .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM test_results", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
