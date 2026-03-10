use serde::Serialize;

/// Represents a file-watching task configuration.
#[derive(Debug, Serialize)]
pub struct WatchedTask {
    pub task_name: String,
    pub patterns: Vec<String>,
    pub active: bool,
}

/// Return a list of currently watched tasks.
/// Placeholder implementation -- real version would use Tauri managed state
/// with a `notify::RecommendedWatcher` behind a Mutex.
#[tauri::command]
pub fn get_watched_tasks() -> Result<Vec<WatchedTask>, String> {
    // Placeholder: real implementation needs managed state with notify watcher
    Ok(vec![])
}
