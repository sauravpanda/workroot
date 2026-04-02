use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub id: i64,
    pub name: String,
    pub command: String,
    pub cron_expr: String,
    pub cwd: String,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub created_at: String,
}

/// Create a new scheduled task.
#[tauri::command]
pub fn create_scheduled_task(
    db: State<'_, AppDb>,
    name: String,
    command: String,
    cron_expr: String,
    cwd: String,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO scheduled_tasks (name, command, cron_expr, cwd) VALUES (?1, ?2, ?3, ?4)",
        params![name, command, cron_expr, cwd],
    )
    .map_err(|e| format!("DB: {}", e))?;
    Ok(conn.last_insert_rowid())
}

/// List all scheduled tasks.
#[tauri::command]
pub fn list_scheduled_tasks(db: State<'_, AppDb>) -> Result<Vec<ScheduledTask>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, command, cron_expr, cwd, enabled, last_run, created_at
             FROM scheduled_tasks ORDER BY created_at DESC",
        )
        .map_err(|e| format!("DB: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ScheduledTask {
                id: row.get(0)?,
                name: row.get(1)?,
                command: row.get(2)?,
                cron_expr: row.get(3)?,
                cwd: row.get(4)?,
                enabled: row.get(5)?,
                last_run: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("DB: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB: {}", e))
}

/// Toggle a scheduled task on or off.
#[tauri::command]
pub fn toggle_scheduled_task(db: State<'_, AppDb>, id: i64, enabled: bool) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "UPDATE scheduled_tasks SET enabled = ?1 WHERE id = ?2",
        params![enabled, id],
    )
    .map_err(|e| format!("DB: {}", e))?;
    Ok(())
}

/// Delete a scheduled task.
#[tauri::command]
pub fn delete_scheduled_task(db: State<'_, AppDb>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute("DELETE FROM scheduled_tasks WHERE id = ?1", params![id])
        .map_err(|e| format!("DB: {}", e))?;
    Ok(())
}

/// Update last_run to the current timestamp.
#[tauri::command]
pub fn update_task_last_run(db: State<'_, AppDb>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "UPDATE scheduled_tasks SET last_run = datetime('now') WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("DB: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::db::init_test_db;
    use rusqlite::params;

    use super::ScheduledTask;

    /// Helper: insert a scheduled task directly.
    fn insert_task(
        conn: &rusqlite::Connection,
        name: &str,
        command: &str,
        cron_expr: &str,
        cwd: &str,
    ) -> i64 {
        conn.execute(
            "INSERT INTO scheduled_tasks (name, command, cron_expr, cwd) VALUES (?1, ?2, ?3, ?4)",
            params![name, command, cron_expr, cwd],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    /// Helper: list all scheduled tasks.
    fn list_tasks(conn: &rusqlite::Connection) -> Vec<ScheduledTask> {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, command, cron_expr, cwd, enabled, last_run, created_at
                 FROM scheduled_tasks ORDER BY created_at DESC",
            )
            .unwrap();
        stmt.query_map([], |row| {
            Ok(ScheduledTask {
                id: row.get(0)?,
                name: row.get(1)?,
                command: row.get(2)?,
                cron_expr: row.get(3)?,
                cwd: row.get(4)?,
                enabled: row.get(5)?,
                last_run: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    }

    #[test]
    fn test_scheduler_create_and_list() {
        let conn = init_test_db();
        let id = insert_task(&conn, "Backup DB", "pg_dump mydb", "0 2 * * *", "/opt/app");
        assert!(id > 0);

        let tasks = list_tasks(&conn);
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].name, "Backup DB");
        assert_eq!(tasks[0].command, "pg_dump mydb");
        assert_eq!(tasks[0].cron_expr, "0 2 * * *");
        assert_eq!(tasks[0].cwd, "/opt/app");
        assert!(tasks[0].enabled);
        assert!(tasks[0].last_run.is_none());
    }

    #[test]
    fn test_scheduler_toggle() {
        let conn = init_test_db();
        let id = insert_task(&conn, "Sync", "rsync .", "*/5 * * * *", "/tmp");

        // Disable
        conn.execute(
            "UPDATE scheduled_tasks SET enabled = ?1 WHERE id = ?2",
            params![false, id],
        )
        .unwrap();

        let tasks = list_tasks(&conn);
        assert!(!tasks[0].enabled);

        // Re-enable
        conn.execute(
            "UPDATE scheduled_tasks SET enabled = ?1 WHERE id = ?2",
            params![true, id],
        )
        .unwrap();

        let tasks = list_tasks(&conn);
        assert!(tasks[0].enabled);
    }

    #[test]
    fn test_scheduler_update_last_run() {
        let conn = init_test_db();
        let id = insert_task(&conn, "Cleanup", "rm -rf /tmp/cache", "0 0 * * *", "/");

        // Initially null
        let tasks = list_tasks(&conn);
        assert!(tasks[0].last_run.is_none());

        // Update last_run
        conn.execute(
            "UPDATE scheduled_tasks SET last_run = datetime('now') WHERE id = ?1",
            params![id],
        )
        .unwrap();

        let tasks = list_tasks(&conn);
        assert!(tasks[0].last_run.is_some());
    }

    #[test]
    fn test_scheduler_delete() {
        let conn = init_test_db();
        let id = insert_task(&conn, "Temp Task", "echo hi", "* * * * *", "/tmp");

        conn.execute("DELETE FROM scheduled_tasks WHERE id = ?1", params![id])
            .unwrap();

        let tasks = list_tasks(&conn);
        assert!(tasks.is_empty());
    }

    #[test]
    fn test_scheduler_multiple_tasks() {
        let conn = init_test_db();
        insert_task(&conn, "Task A", "cmd_a", "0 * * * *", "/a");
        insert_task(&conn, "Task B", "cmd_b", "30 * * * *", "/b");
        insert_task(&conn, "Task C", "cmd_c", "0 0 * * 0", "/c");

        let tasks = list_tasks(&conn);
        assert_eq!(tasks.len(), 3);
    }
}
