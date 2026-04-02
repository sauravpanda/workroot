use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
pub struct DirectoryStats {
    pub total_files: usize,
    pub total_dirs: usize,
    pub total_size_bytes: u64,
    pub by_extension: Vec<ExtensionCount>,
    pub largest_files: Vec<FileEntry>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ExtensionCount {
    pub extension: String,
    pub count: usize,
    pub total_bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub path: String,
    pub size_bytes: u64,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".venv",
];

/// Walk a directory tree and collect aggregate statistics.
#[tauri::command]
pub fn get_directory_stats(cwd: String) -> Result<DirectoryStats, String> {
    let root = Path::new(&cwd);
    if !root.is_dir() {
        return Err(format!("Not a directory: {cwd}"));
    }

    let mut total_files: usize = 0;
    let mut total_dirs: usize = 0;
    let mut total_size_bytes: u64 = 0;
    let mut ext_map: HashMap<String, (usize, u64)> = HashMap::new();
    let mut all_files: Vec<FileEntry> = Vec::new();

    walk_dir(
        root,
        &mut total_files,
        &mut total_dirs,
        &mut total_size_bytes,
        &mut ext_map,
        &mut all_files,
    )
    .map_err(|e| format!("Walk dir: {e}"))?;

    // Sort by size descending, take top 10
    all_files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    all_files.truncate(10);

    let mut by_extension: Vec<ExtensionCount> = ext_map
        .into_iter()
        .map(|(ext, (count, bytes))| ExtensionCount {
            extension: ext,
            count,
            total_bytes: bytes,
        })
        .collect();
    by_extension.sort_by(|a, b| b.count.cmp(&a.count));

    Ok(DirectoryStats {
        total_files,
        total_dirs,
        total_size_bytes,
        by_extension,
        largest_files: all_files,
    })
}

fn walk_dir(
    dir: &Path,
    total_files: &mut usize,
    total_dirs: &mut usize,
    total_size_bytes: &mut u64,
    ext_map: &mut HashMap<String, (usize, u64)>,
    all_files: &mut Vec<FileEntry>,
) -> std::io::Result<()> {
    let entries = std::fs::read_dir(dir)?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();

        if path.is_dir() {
            if SKIP_DIRS.contains(&name_str.as_ref()) {
                continue;
            }
            *total_dirs += 1;
            walk_dir(
                dir.join(&file_name).as_path(),
                total_files,
                total_dirs,
                total_size_bytes,
                ext_map,
                all_files,
            )?;
        } else if path.is_file() {
            let metadata = entry.metadata()?;
            let size = metadata.len();
            *total_files += 1;
            *total_size_bytes += size;

            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_else(|| "(none)".to_string());

            let entry_val = ext_map.entry(ext).or_insert((0, 0));
            entry_val.0 += 1;
            entry_val.1 += size;

            all_files.push(FileEntry {
                path: path.to_string_lossy().to_string(),
                size_bytes: size,
            });
        }
    }

    Ok(())
}
