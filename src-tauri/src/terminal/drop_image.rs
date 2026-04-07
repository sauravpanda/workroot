use std::fs;
use std::path::PathBuf;

/// Save base64-encoded image data to a temporary file and return the path.
///
/// The file is placed in the system temp directory with a unique name so it
/// can be referenced by the terminal session (e.g. passed to `claude`).
#[tauri::command]
pub fn save_dropped_image(data: Vec<u8>, extension: String) -> Result<String, String> {
    let ext = if extension.is_empty() {
        "png".to_string()
    } else {
        extension.trim_start_matches('.').to_string()
    };

    let tmp_dir = std::env::temp_dir().join("workroot-drops");
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("Failed to create temp dir: {e}"))?;

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let filename = format!("drop-{stamp}.{ext}");
    let path: PathBuf = tmp_dir.join(filename);

    fs::write(&path, &data).map_err(|e| format!("Failed to write image: {e}"))?;

    Ok(path.to_string_lossy().to_string())
}
