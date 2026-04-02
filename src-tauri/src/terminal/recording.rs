use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct TerminalEvent {
    pub timestamp_ms: i64,
    pub event_type: String,
    pub data: String,
}

#[derive(Debug, Serialize)]
pub struct SessionRecording {
    pub id: i64,
    pub title: String,
    pub worktree_id: i64,
    pub duration_ms: i64,
    pub event_count: i64,
    pub created_at: String,
}

/// Creates a new terminal session recording. Returns the session ID.
#[tauri::command]
pub fn start_recording(
    db: State<'_, AppDb>,
    worktree_id: i64,
    title: String,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO terminal_sessions (worktree_id, title, status) VALUES (?1, ?2, 'recording')",
        params![worktree_id, title],
    )
    .map_err(|e| format!("Failed to start recording: {}", e))?;
    Ok(conn.last_insert_rowid())
}

/// Adds an event (input or output) to a recording session.
#[tauri::command]
pub fn add_recording_event(
    db: State<'_, AppDb>,
    session_id: i64,
    event_type: String,
    data: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let timestamp_ms = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO terminal_events (session_id, event_type, data, timestamp_ms) VALUES (?1, ?2, ?3, ?4)",
        params![session_id, event_type, data, timestamp_ms],
    )
    .map_err(|e| format!("Failed to add event: {}", e))?;
    Ok(())
}

/// Marks a recording session as complete and calculates duration from first to last event.
#[tauri::command]
pub fn stop_recording(db: State<'_, AppDb>, session_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Calculate duration from first to last event
    let duration_ms: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(timestamp_ms) - MIN(timestamp_ms), 0) FROM terminal_events WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "UPDATE terminal_sessions SET status = 'complete', duration_ms = ?1 WHERE id = ?2",
        params![duration_ms, session_id],
    )
    .map_err(|e| format!("Failed to stop recording: {}", e))?;
    Ok(())
}

/// Lists all recordings for a given worktree.
#[tauri::command]
pub fn list_recordings(
    db: State<'_, AppDb>,
    worktree_id: i64,
) -> Result<Vec<SessionRecording>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.title, s.worktree_id, s.duration_ms,
                    (SELECT COUNT(*) FROM terminal_events WHERE session_id = s.id) as event_count,
                    s.created_at
             FROM terminal_sessions s
             WHERE s.worktree_id = ?1
             ORDER BY s.created_at DESC",
        )
        .map_err(|e| format!("Query: {}", e))?;

    let rows = stmt
        .query_map(params![worktree_id], |row| {
            Ok(SessionRecording {
                id: row.get(0)?,
                title: row.get(1)?,
                worktree_id: row.get(2)?,
                duration_ms: row.get(3)?,
                event_count: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    Ok(results)
}

/// Gets all events for a recording session, suitable for replay.
#[tauri::command]
pub fn get_recording_events(
    db: State<'_, AppDb>,
    session_id: i64,
) -> Result<Vec<TerminalEvent>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT timestamp_ms, event_type, data FROM terminal_events WHERE session_id = ?1 ORDER BY timestamp_ms ASC",
        )
        .map_err(|e| format!("Query: {}", e))?;

    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(TerminalEvent {
                timestamp_ms: row.get(0)?,
                event_type: row.get(1)?,
                data: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    Ok(results)
}

/// Deletes a recording and all its events (cascaded by FK).
#[tauri::command]
pub fn delete_recording(db: State<'_, AppDb>, session_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "DELETE FROM terminal_sessions WHERE id = ?1",
        params![session_id],
    )
    .map_err(|e| format!("Failed to delete recording: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_test_db, AppDb};

    fn setup_db() -> AppDb {
        let conn = init_test_db();
        conn.execute(
            "INSERT INTO projects (id, name, local_path) VALUES (1, 'test', '/tmp')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO worktrees (id, project_id, branch_name, path) VALUES (1, 1, 'main', '/tmp')",
            [],
        )
        .unwrap();
        AppDb(std::sync::Mutex::new(conn))
    }

    #[test]
    fn test_start_and_list_recordings() {
        let db = setup_db();
        let session_id;
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO terminal_sessions (worktree_id, title, status) VALUES (1, 'My Session', 'recording')",
                [],
            )
            .unwrap();
            session_id = conn.last_insert_rowid();
        }

        assert!(session_id > 0);

        // List recordings for worktree 1
        let conn = db.0.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.title, s.worktree_id, s.duration_ms,
                        (SELECT COUNT(*) FROM terminal_events WHERE session_id = s.id) as event_count,
                        s.created_at
                 FROM terminal_sessions s
                 WHERE s.worktree_id = 1
                 ORDER BY s.created_at DESC",
            )
            .unwrap();
        let recordings: Vec<SessionRecording> = stmt
            .query_map([], |row| {
                Ok(SessionRecording {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    worktree_id: row.get(2)?,
                    duration_ms: row.get(3)?,
                    event_count: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(recordings.len(), 1);
        assert_eq!(recordings[0].title, "My Session");
        assert_eq!(recordings[0].worktree_id, 1);
        assert_eq!(recordings[0].event_count, 0);
    }

    #[test]
    fn test_add_events_and_retrieve() {
        let db = setup_db();
        let session_id;
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO terminal_sessions (worktree_id, title, status) VALUES (1, 'Events Test', 'recording')",
                [],
            )
            .unwrap();
            session_id = conn.last_insert_rowid();

            // Add events with explicit timestamps
            conn.execute(
                "INSERT INTO terminal_events (session_id, event_type, data, timestamp_ms) VALUES (?1, 'input', 'ls -la', 1000)",
                params![session_id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO terminal_events (session_id, event_type, data, timestamp_ms) VALUES (?1, 'output', 'file1.txt\nfile2.txt', 1500)",
                params![session_id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO terminal_events (session_id, event_type, data, timestamp_ms) VALUES (?1, 'input', 'pwd', 2000)",
                params![session_id],
            )
            .unwrap();
        }

        // Retrieve events
        let conn = db.0.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT timestamp_ms, event_type, data FROM terminal_events WHERE session_id = ?1 ORDER BY timestamp_ms ASC",
            )
            .unwrap();
        let events: Vec<TerminalEvent> = stmt
            .query_map(params![session_id], |row| {
                Ok(TerminalEvent {
                    timestamp_ms: row.get(0)?,
                    event_type: row.get(1)?,
                    data: row.get(2)?,
                })
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(events.len(), 3);
        assert_eq!(events[0].event_type, "input");
        assert_eq!(events[0].data, "ls -la");
        assert_eq!(events[0].timestamp_ms, 1000);
        assert_eq!(events[1].event_type, "output");
        assert_eq!(events[2].event_type, "input");
        assert_eq!(events[2].timestamp_ms, 2000);
    }

    #[test]
    fn test_stop_recording_calculates_duration() {
        let db = setup_db();
        let session_id;
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO terminal_sessions (worktree_id, title, status) VALUES (1, 'Duration Test', 'recording')",
                [],
            )
            .unwrap();
            session_id = conn.last_insert_rowid();

            // Add events spanning 5000ms
            conn.execute(
                "INSERT INTO terminal_events (session_id, event_type, data, timestamp_ms) VALUES (?1, 'input', 'cmd1', 1000)",
                params![session_id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO terminal_events (session_id, event_type, data, timestamp_ms) VALUES (?1, 'output', 'out1', 3000)",
                params![session_id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO terminal_events (session_id, event_type, data, timestamp_ms) VALUES (?1, 'input', 'cmd2', 6000)",
                params![session_id],
            )
            .unwrap();

            // Stop the recording: calculate duration from min to max timestamp
            let duration_ms: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(timestamp_ms) - MIN(timestamp_ms), 0) FROM terminal_events WHERE session_id = ?1",
                    params![session_id],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            conn.execute(
                "UPDATE terminal_sessions SET status = 'complete', duration_ms = ?1 WHERE id = ?2",
                params![duration_ms, session_id],
            )
            .unwrap();
        }

        // Verify
        let conn = db.0.lock().unwrap();
        let (status, duration_ms): (String, i64) = conn
            .query_row(
                "SELECT status, duration_ms FROM terminal_sessions WHERE id = ?1",
                params![session_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(status, "complete");
        assert_eq!(duration_ms, 5000); // 6000 - 1000
    }

    #[test]
    fn test_delete_recording() {
        let db = setup_db();
        let session_id;
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO terminal_sessions (worktree_id, title, status) VALUES (1, 'Delete Test', 'recording')",
                [],
            )
            .unwrap();
            session_id = conn.last_insert_rowid();

            // Add some events
            conn.execute(
                "INSERT INTO terminal_events (session_id, event_type, data, timestamp_ms) VALUES (?1, 'input', 'hello', 100)",
                params![session_id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO terminal_events (session_id, event_type, data, timestamp_ms) VALUES (?1, 'output', 'world', 200)",
                params![session_id],
            )
            .unwrap();
        }

        // Verify events exist
        {
            let conn = db.0.lock().unwrap();
            let event_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM terminal_events WHERE session_id = ?1",
                    params![session_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(event_count, 2);
        }

        // Delete the recording
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "DELETE FROM terminal_sessions WHERE id = ?1",
                params![session_id],
            )
            .unwrap();
        }

        // Verify session is gone
        let conn = db.0.lock().unwrap();
        let session_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM terminal_sessions WHERE id = ?1",
                params![session_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(session_count, 0);

        // Verify events were cascade-deleted
        let event_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM terminal_events WHERE session_id = ?1",
                params![session_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(event_count, 0);
    }
}
