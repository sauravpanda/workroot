use crate::db::AppDb;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct ActivityEvent {
    pub id: i64,
    pub event_type: String,
    pub title: String,
    pub detail: Option<String>,
    pub project_id: Option<i64>,
    pub created_at: String,
}

/// Record an activity event in the timeline.
#[tauri::command]
pub fn record_activity(
    db: State<'_, AppDb>,
    event_type: String,
    title: String,
    detail: Option<String>,
    project_id: Option<i64>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO activity_events (event_type, title, detail, project_id) VALUES (?1, ?2, ?3, ?4)",
        params![event_type, title, detail, project_id],
    )
    .map_err(|e| format!("Insert activity event: {}", e))?;

    Ok(conn.last_insert_rowid())
}

/// Get the activity timeline, ordered by most recent first.
#[tauri::command]
pub fn get_activity_timeline(
    db: State<'_, AppDb>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ActivityEvent>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT id, event_type, title, detail, project_id, created_at
             FROM activity_events
             ORDER BY created_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| format!("Prepare timeline query: {}", e))?;

    let rows = stmt
        .query_map(params![limit, offset], |row| {
            Ok(ActivityEvent {
                id: row.get(0)?,
                event_type: row.get(1)?,
                title: row.get(2)?,
                detail: row.get(3)?,
                project_id: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Query timeline: {}", e))?;

    let mut events = Vec::new();
    for row in rows {
        events.push(row.map_err(|e| format!("Row: {}", e))?);
    }

    Ok(events)
}

#[cfg(test)]
mod tests {
    use crate::db::init_test_db;

    #[test]
    fn activity_events_table_exists() {
        let conn = init_test_db();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='activity_events'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "activity_events table should exist");
    }

    #[test]
    fn activity_events_index_exists() {
        let conn = init_test_db();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_activity_events_created'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "idx_activity_events_created should exist");
    }

    #[test]
    fn insert_and_query_activity_event() {
        let conn = init_test_db();

        conn.execute(
            "INSERT INTO activity_events (event_type, title, detail, project_id) VALUES ('commit', 'Initial commit', 'Added README', NULL)",
            [],
        )
        .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM activity_events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
