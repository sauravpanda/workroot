use git2::{Repository, StatusOptions};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

/// A single entry in a directory listing.
#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// List the immediate children of a directory.
/// Skips `.git`. Returns dirs before files, both sorted alphabetically.
#[tauri::command]
pub fn list_dir(dir_path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries: Vec<DirEntry> = Vec::new();

    for item in std::fs::read_dir(&dir_path).map_err(|e| format!("Cannot read directory: {}", e))? {
        let item = item.map_err(|e| format!("Directory entry error: {}", e))?;
        let name = item.file_name().to_string_lossy().to_string();

        if name == ".git" {
            continue;
        }

        let metadata = item
            .metadata()
            .map_err(|e| format!("Cannot read metadata for {}: {}", name, e))?;

        entries.push(DirEntry {
            name,
            path: item.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Get git status for every file in a worktree.
/// Returns a map of relative path → status letter (M, A, D, R, U).
#[tauri::command]
pub fn get_worktree_file_statuses(
    worktree_path: String,
) -> Result<HashMap<String, String>, String> {
    let repo = Repository::open(&worktree_path)
        .map_err(|e| format!("Failed to open git repository: {}", e))?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("Failed to read git status: {}", e))?;

    let mut map: HashMap<String, String> = HashMap::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let s = entry.status();

        let label = if s.is_wt_modified() || s.is_index_modified() {
            "M"
        } else if s.is_index_new() {
            "A"
        } else if s.is_wt_new() {
            "U"
        } else if s.is_index_deleted() || s.is_wt_deleted() {
            "D"
        } else if s.is_index_renamed() || s.is_wt_renamed() {
            "R"
        } else {
            continue;
        };

        map.insert(path, label.to_string());
    }

    Ok(map)
}

/// Read a text file's content for in-app preview.
/// Returns an error for binary files or files larger than 512 KB.
#[tauri::command]
pub fn read_file_content(file_path: String) -> Result<String, String> {
    const MAX_BYTES: u64 = 512 * 1024;

    let metadata =
        std::fs::metadata(&file_path).map_err(|e| format!("Cannot access file: {}", e))?;

    if metadata.len() > MAX_BYTES {
        return Err(format!(
            "File is too large ({} KB) for preview. Max 512 KB.",
            metadata.len() / 1024
        ));
    }

    let bytes = std::fs::read(&file_path).map_err(|e| format!("Cannot read file: {}", e))?;

    // Heuristic binary check: look for null bytes in the first 8 KB.
    let check_len = bytes.len().min(8192);
    if bytes[..check_len].contains(&0u8) {
        return Err("Binary file — preview not available.".to_string());
    }

    String::from_utf8(bytes).map_err(|_| "File contains non-UTF-8 content.".to_string())
}

/// Open a file using the OS default application (editor, viewer, etc.).
#[tauri::command]
pub fn open_file_in_editor(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &file_path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    Ok(())
}
