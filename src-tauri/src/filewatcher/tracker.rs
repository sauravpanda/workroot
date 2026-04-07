use crate::db::AppDb;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::params;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

/// Manages file watchers for active worktrees.
pub struct FileWatcherRegistry {
    watchers: Mutex<HashMap<i64, RecommendedWatcher>>,
}

impl FileWatcherRegistry {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }

    /// Remove watchers for project IDs that are no longer valid.
    /// Call this periodically or when projects are deleted.
    pub fn remove_stale(&self, valid_ids: &[i64]) {
        if let Ok(mut watchers) = self.watchers.lock() {
            watchers.retain(|id, _| valid_ids.contains(id));
        }
    }

    /// Remove all watchers, releasing OS file descriptors.
    pub fn stop_all(&self) {
        if let Ok(mut watchers) = self.watchers.lock() {
            watchers.clear();
        }
    }

    /// Returns the number of active watchers.
    pub fn count(&self) -> usize {
        self.watchers.lock().map(|w| w.len()).unwrap_or(0)
    }
}

impl Default for FileWatcherRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Start watching a worktree directory.
pub fn start_watching(app: &AppHandle, project_id: i64, path: &str) -> Result<(), String> {
    let registry = app.state::<FileWatcherRegistry>();
    let mut watchers = registry
        .watchers
        .lock()
        .map_err(|e| format!("Lock: {}", e))?;

    // Already watching
    if watchers.contains_key(&project_id) {
        return Ok(());
    }

    let watch_path = PathBuf::from(path);
    if !watch_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let _db = app.state::<AppDb>();
    let db_clone = Arc::new(Mutex::new(()));
    let app_handle = app.clone();
    let pid = project_id;

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            let _lock = db_clone.lock();
            handle_event(&app_handle, pid, &event);
        }
    })
    .map_err(|e| format!("Watcher: {}", e))?;

    watcher
        .watch(&watch_path, RecursiveMode::Recursive)
        .map_err(|e| format!("Watch: {}", e))?;

    watchers.insert(project_id, watcher);
    Ok(())
}

/// Stop watching a worktree directory.
pub fn stop_watching(app: &AppHandle, project_id: i64) -> Result<(), String> {
    let registry = app.state::<FileWatcherRegistry>();
    let mut watchers = registry
        .watchers
        .lock()
        .map_err(|e| format!("Lock: {}", e))?;
    watchers.remove(&project_id);
    Ok(())
}

/// Handle a file system event.
fn handle_event(app: &AppHandle, project_id: i64, event: &Event) {
    let event_type = match event.kind {
        EventKind::Create(_) => "create",
        EventKind::Modify(_) => "modify",
        EventKind::Remove(_) => "delete",
        _ => return,
    };

    for path in &event.paths {
        if super::should_ignore(path) {
            continue;
        }

        let file_path = path.to_string_lossy().to_string();
        let db = app.try_state::<AppDb>();
        if let Some(db) = db {
            let _ = record_event(db.inner(), project_id, &file_path, event_type);
        }
    }
}

/// Store a file event in the database.
fn record_event(
    db: &AppDb,
    project_id: i64,
    file_path: &str,
    event_type: &str,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO file_events (project_id, file_path, event_type) VALUES (?1, ?2, ?3)",
        params![project_id, file_path, event_type],
    )
    .map_err(|e| format!("Insert file event: {}", e))?;
    Ok(())
}

/// Clean up old file events (older than 7 days).
pub fn cleanup_old_events(db: &AppDb) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let deleted = conn
        .execute(
            "DELETE FROM file_events WHERE timestamp < datetime('now', '-7 days')",
            [],
        )
        .map_err(|e| format!("Cleanup: {}", e))?;
    Ok(deleted)
}

/// Get recent file events for a project.
pub fn get_recent_events(
    db: &AppDb,
    project_id: i64,
    limit: i64,
) -> Result<Vec<super::FileEvent>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT project_id, file_path, event_type FROM file_events
             WHERE project_id = ?1 ORDER BY timestamp DESC LIMIT ?2",
        )
        .map_err(|e| format!("Query: {}", e))?;

    let rows = stmt
        .query_map(params![project_id, limit], |row| {
            Ok(super::FileEvent {
                project_id: row.get(0)?,
                file_path: row.get(1)?,
                event_type: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_test_db;

    #[test]
    fn record_and_query_events() {
        let conn = init_test_db();
        conn.execute(
            "INSERT INTO projects (id, name, local_path) VALUES (1, 'test', '/tmp')",
            [],
        )
        .unwrap();

        let db = AppDb(std::sync::Mutex::new(conn));
        record_event(&db, 1, "/tmp/src/main.rs", "modify").unwrap();
        record_event(&db, 1, "/tmp/src/lib.rs", "create").unwrap();

        let events = get_recent_events(&db, 1, 10).unwrap();
        assert_eq!(events.len(), 2);
        let types: Vec<&str> = events.iter().map(|e| e.event_type.as_str()).collect();
        assert!(types.contains(&"create"));
        assert!(types.contains(&"modify"));
    }

    #[test]
    fn should_ignore_works() {
        use std::path::Path;
        assert!(super::super::should_ignore(Path::new(
            "/project/node_modules/foo/bar.js"
        )));
        assert!(super::super::should_ignore(Path::new("/project/.git/HEAD")));
        assert!(super::super::should_ignore(Path::new(
            "/project/target/debug/main"
        )));
        assert!(!super::super::should_ignore(Path::new(
            "/project/src/main.rs"
        )));
    }
}
