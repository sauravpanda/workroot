pub mod analysis;
pub mod tracker;

use serde::Serialize;

/// A file change event.
#[derive(Debug, Serialize, Clone)]
pub struct FileEvent {
    pub project_id: i64,
    pub file_path: String,
    pub event_type: String,
}

/// Directories to ignore when watching.
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "venv",
    ".turbo",
    ".cache",
];

/// Check if a path should be ignored.
pub fn should_ignore(path: &std::path::Path) -> bool {
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
