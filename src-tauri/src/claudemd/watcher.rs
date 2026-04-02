use crate::db::queries;
use crate::db::AppDb;
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// Tracks pending regeneration requests with debouncing.
pub struct ClaudeMdWatcher {
    pending: Mutex<HashSet<i64>>,
    last_run: Mutex<Instant>,
}

impl Default for ClaudeMdWatcher {
    fn default() -> Self {
        Self::new()
    }
}

impl ClaudeMdWatcher {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashSet::new()),
            last_run: Mutex::new(Instant::now() - Duration::from_secs(10)),
        }
    }

    /// Marks a worktree for CLAUDE.md regeneration (debounced).
    pub fn schedule_regeneration(&self, worktree_id: i64) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(worktree_id);
        }
    }

    /// Processes all pending regenerations if debounce window has elapsed.
    /// Returns the list of worktree IDs that were regenerated.
    pub fn process_pending(&self, app: &AppHandle) -> Vec<i64> {
        let debounce = Duration::from_secs(2);

        // Check if debounce window has elapsed
        let should_run = {
            let last = self.last_run.lock().unwrap_or_else(|p| p.into_inner());
            last.elapsed() >= debounce
        };

        if !should_run {
            return Vec::new();
        }

        // Take all pending IDs
        let worktree_ids: Vec<i64> = {
            let mut pending = self.pending.lock().unwrap_or_else(|p| p.into_inner());
            let ids: Vec<i64> = pending.drain().collect();
            ids
        };

        if worktree_ids.is_empty() {
            return Vec::new();
        }

        // Update last run time
        {
            let mut last = self.last_run.lock().unwrap_or_else(|p| p.into_inner());
            *last = Instant::now();
        }

        let db = app.state::<AppDb>();
        let conn = match db.0.lock() {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };

        let mut regenerated = Vec::new();

        for wt_id in &worktree_ids {
            match super::template::generate_claude_md(&conn, *wt_id) {
                Ok(content) => {
                    // Only write if content changed
                    if should_write(&conn, *wt_id, &content)
                        && super::template::write_claude_md(&conn, *wt_id, &content).is_ok()
                    {
                        regenerated.push(*wt_id);
                    }
                }
                Err(e) => {
                    eprintln!("CLAUDE.md generation failed for worktree {}: {}", wt_id, e);
                }
            }
        }

        regenerated
    }
}

/// Checks if the content has changed from the existing file.
fn should_write(conn: &rusqlite::Connection, worktree_id: i64, new_content: &str) -> bool {
    let worktree = match queries::get_worktree(conn, worktree_id) {
        Ok(Some(w)) => w,
        _ => return true,
    };

    let claude_path = std::path::Path::new(&worktree.path).join("CLAUDE.md");
    match std::fs::read_to_string(&claude_path) {
        Ok(existing) => existing != new_content,
        Err(_) => true,
    }
}

/// Sets up a background task that processes pending CLAUDE.md regenerations.
pub fn start_watcher_loop(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;

            let watcher = app_handle.state::<ClaudeMdWatcher>();
            let regenerated = watcher.process_pending(&app_handle);

            if !regenerated.is_empty() {
                eprintln!("CLAUDE.md regenerated for worktrees: {:?}", regenerated);
            }
        }
    });
}

/// Convenience function: schedule regeneration for all worktrees of a project.
pub fn schedule_project_regeneration(app: &AppHandle, project_id: i64) {
    let db = app.state::<AppDb>();
    if let Ok(conn) = db.0.lock() {
        if let Ok(worktrees) = queries::list_worktrees(&conn, project_id) {
            let watcher = app.state::<ClaudeMdWatcher>();
            for wt in &worktrees {
                watcher.schedule_regeneration(wt.id);
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watcher_deduplicates() {
        let watcher = ClaudeMdWatcher::new();
        watcher.schedule_regeneration(1);
        watcher.schedule_regeneration(1);
        watcher.schedule_regeneration(2);

        let pending = watcher.pending.lock().unwrap();
        assert_eq!(pending.len(), 2);
    }
}
