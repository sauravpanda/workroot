use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Directories to ignore when watching for task-related file changes.
const IGNORED_DIRS: &[&str] = &["node_modules", ".git", "target", "dist", "build"];

/// Check if a path should be ignored by the task watcher.
fn should_ignore_path(path: &Path) -> bool {
    for component in path.components() {
        if let std::path::Component::Normal(name) = component {
            let name_str = name.to_string_lossy();
            if IGNORED_DIRS.contains(&name_str.as_ref()) {
                return true;
            }
        }
    }
    false
}

/// An active watch entry holding the watcher and its metadata.
pub struct WatchEntry {
    pub task_name: String,
    pub patterns: Vec<String>,
    pub cwd: String,
    pub _watcher: RecommendedWatcher,
}

/// Managed state that tracks all active file watchers keyed by "cwd::task_name".
pub struct WatchState {
    entries: Mutex<HashMap<String, WatchEntry>>,
}

impl WatchState {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for WatchState {
    fn default() -> Self {
        Self::new()
    }
}

/// Payload emitted with the `watch:file-changed` event.
#[derive(Debug, Clone, Serialize)]
struct WatchFileChangedPayload {
    task_name: String,
    changed_paths: Vec<String>,
}

/// Represents a file-watching task configuration.
#[derive(Debug, Serialize)]
pub struct WatchedTask {
    pub task_name: String,
    pub patterns: Vec<String>,
    pub active: bool,
}

/// Build the state key from cwd and task_name.
fn make_key(cwd: &str, task_name: &str) -> String {
    format!("{}::{}", cwd, task_name)
}

/// Start watching files under `cwd` that match `patterns` for a given task.
/// When changes are detected, emits `watch:file-changed` with the task name and paths.
#[tauri::command]
pub fn start_watch_task(
    app: AppHandle,
    watch_state: State<'_, WatchState>,
    cwd: String,
    task_name: String,
    patterns: Vec<String>,
) -> Result<(), String> {
    let key = make_key(&cwd, &task_name);

    let mut entries = watch_state
        .entries
        .lock()
        .map_err(|e| format!("Lock: {}", e))?;

    // If already watching this task, remove the old watcher first
    entries.remove(&key);

    let watch_path = std::path::PathBuf::from(&cwd);
    if !watch_path.exists() {
        return Err(format!("Path does not exist: {}", cwd));
    }

    let task_name_clone = task_name.clone();
    let patterns_clone = patterns.clone();
    let app_handle = app.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            // Only care about create, modify, remove events
            match event.kind {
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {}
                _ => return,
            }

            let mut changed: Vec<String> = Vec::new();
            for path in &event.paths {
                if should_ignore_path(path) {
                    continue;
                }

                let path_str = path.to_string_lossy().to_string();

                // If patterns are provided, check if the file matches any pattern
                if !patterns_clone.is_empty() {
                    let matches_any = patterns_clone.iter().any(|pattern| {
                        // Simple glob matching: support *.ext and **/*.ext patterns
                        if let Some(ext) = pattern.strip_prefix("*.") {
                            path_str.ends_with(&format!(".{}", ext))
                        } else if let Some(ext) = pattern.strip_prefix("**/*.") {
                            path_str.ends_with(&format!(".{}", ext))
                        } else {
                            path_str.contains(pattern)
                        }
                    });
                    if !matches_any {
                        continue;
                    }
                }

                changed.push(path_str);
            }

            if !changed.is_empty() {
                let payload = WatchFileChangedPayload {
                    task_name: task_name_clone.clone(),
                    changed_paths: changed,
                };
                let _ = app_handle.emit("watch:file-changed", payload);
            }
        }
    })
    .map_err(|e| format!("Watcher: {}", e))?;

    watcher
        .watch(&watch_path, RecursiveMode::Recursive)
        .map_err(|e| format!("Watch: {}", e))?;

    entries.insert(
        key,
        WatchEntry {
            task_name,
            patterns,
            cwd,
            _watcher: watcher,
        },
    );

    Ok(())
}

/// Stop watching files for a given task.
#[tauri::command]
pub fn stop_watch_task(
    watch_state: State<'_, WatchState>,
    cwd: String,
    task_name: String,
) -> Result<(), String> {
    let key = make_key(&cwd, &task_name);
    let mut entries = watch_state
        .entries
        .lock()
        .map_err(|e| format!("Lock: {}", e))?;
    entries.remove(&key);
    Ok(())
}

/// Return a list of currently watched tasks.
#[tauri::command]
pub fn get_watched_tasks(watch_state: State<'_, WatchState>) -> Result<Vec<WatchedTask>, String> {
    let entries = watch_state
        .entries
        .lock()
        .map_err(|e| format!("Lock: {}", e))?;

    let tasks: Vec<WatchedTask> = entries
        .values()
        .map(|entry| WatchedTask {
            task_name: entry.task_name.clone(),
            patterns: entry.patterns.clone(),
            active: true,
        })
        .collect();

    Ok(tasks)
}
