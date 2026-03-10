use crate::db::AppDb;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct TaskRun {
    pub id: i64,
    pub task_name: String,
    pub cwd: String,
    pub exit_code: i32,
    pub duration_ms: i64,
    pub output_preview: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct TaskComparison {
    pub run_a: TaskRun,
    pub run_b: TaskRun,
    pub duration_delta_ms: i64,
    pub exit_code_changed: bool,
    pub regression: bool,
}

/// Store a task run result. Keeps at most 20 runs per (task_name, cwd) pair.
#[tauri::command]
pub fn record_task_run(
    db: State<'_, AppDb>,
    cwd: String,
    task_name: String,
    exit_code: i32,
    duration_ms: i64,
    output: String,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Truncate output to first 500 characters
    let output_preview: String = output.chars().take(500).collect();

    conn.execute(
        "INSERT INTO task_runs (task_name, cwd, exit_code, duration_ms, output_preview) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![task_name, cwd, exit_code, duration_ms, output_preview],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    // Prune old runs: keep only the most recent 20 per (task_name, cwd)
    conn.execute(
        "DELETE FROM task_runs WHERE id IN (
            SELECT id FROM task_runs
            WHERE task_name = ?1 AND cwd = ?2
            ORDER BY id DESC
            LIMIT -1 OFFSET 20
        )",
        rusqlite::params![task_name, cwd],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

/// Get recent task runs for a given (cwd, task_name) pair.
#[tauri::command]
pub fn get_task_history(
    db: State<'_, AppDb>,
    cwd: String,
    task_name: String,
    limit: Option<i64>,
) -> Result<Vec<TaskRun>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(20);

    let mut stmt = conn
        .prepare(
            "SELECT id, task_name, cwd, exit_code, duration_ms, output_preview, created_at
             FROM task_runs
             WHERE cwd = ?1 AND task_name = ?2
             ORDER BY id DESC
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![cwd, task_name, limit], |row| {
            Ok(TaskRun {
                id: row.get(0)?,
                task_name: row.get(1)?,
                cwd: row.get(2)?,
                exit_code: row.get(3)?,
                duration_ms: row.get(4)?,
                output_preview: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut runs = Vec::new();
    for row in rows {
        runs.push(row.map_err(|e| e.to_string())?);
    }

    Ok(runs)
}

fn fetch_run(conn: &rusqlite::Connection, run_id: i64) -> Result<TaskRun, String> {
    conn.query_row(
        "SELECT id, task_name, cwd, exit_code, duration_ms, output_preview, created_at
         FROM task_runs WHERE id = ?1",
        rusqlite::params![run_id],
        |row| {
            Ok(TaskRun {
                id: row.get(0)?,
                task_name: row.get(1)?,
                cwd: row.get(2)?,
                exit_code: row.get(3)?,
                duration_ms: row.get(4)?,
                output_preview: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )
    .map_err(|e| format!("Run not found: {}", e))
}

/// Compare two task runs by their IDs.
#[tauri::command]
pub fn compare_task_runs(
    db: State<'_, AppDb>,
    run_id_a: i64,
    run_id_b: i64,
) -> Result<TaskComparison, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let run_a = fetch_run(&conn, run_id_a)?;
    let run_b = fetch_run(&conn, run_id_b)?;

    let duration_delta_ms = run_b.duration_ms - run_a.duration_ms;
    let exit_code_changed = run_a.exit_code != run_b.exit_code;

    // Regression: duration increased by more than 10%
    let regression = if run_a.duration_ms > 0 {
        let threshold = (run_a.duration_ms as f64) * 0.1;
        duration_delta_ms as f64 > threshold
    } else {
        duration_delta_ms > 0
    };

    Ok(TaskComparison {
        run_a,
        run_b,
        duration_delta_ms,
        exit_code_changed,
        regression,
    })
}

#[cfg(test)]
mod tests {
    use crate::db::init_test_db;

    #[test]
    fn record_and_fetch_runs() {
        let conn = init_test_db();

        conn.execute(
            "INSERT INTO task_runs (task_name, cwd, exit_code, duration_ms, output_preview) VALUES ('build', '/tmp', 0, 1200, 'ok')",
            [],
        )
        .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM task_runs", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn output_preview_stored() {
        let conn = init_test_db();

        conn.execute(
            "INSERT INTO task_runs (task_name, cwd, exit_code, duration_ms, output_preview) VALUES ('test', '/app', 1, 500, 'FAIL: some test')",
            [],
        )
        .unwrap();

        let preview: String = conn
            .query_row(
                "SELECT output_preview FROM task_runs WHERE task_name = 'test'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(preview, "FAIL: some test");
    }

    #[test]
    fn index_exists() {
        let conn = init_test_db();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_task_runs_lookup'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "idx_task_runs_lookup should exist");
    }
}
