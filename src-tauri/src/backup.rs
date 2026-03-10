use crate::db::AppDb;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct BackupInfo {
    pub path: String,
    pub size_bytes: u64,
    pub created_at: String,
}

/// Get the backup directory inside the app data directory.
fn backup_dir() -> Result<PathBuf, String> {
    let home = dirs_fallback()?;
    let dir = home.join("workroot-backups");
    fs::create_dir_all(&dir).map_err(|e| format!("Create backup dir: {}", e))?;
    Ok(dir)
}

/// Simple fallback to find a reasonable backup location.
fn dirs_fallback() -> Result<PathBuf, String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .map_err(|_| "Cannot determine home directory".to_string())
}

/// Export all settings and bookmarks as a JSON backup file.
#[tauri::command]
pub async fn export_backup(db: State<'_, AppDb>) -> Result<BackupInfo, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Collect settings
    let mut settings_stmt = conn
        .prepare("SELECT key, value FROM settings ORDER BY key")
        .map_err(|e| format!("Prepare settings: {}", e))?;

    let settings: Vec<serde_json::Value> = settings_stmt
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok(serde_json::json!({ "key": key, "value": value }))
        })
        .map_err(|e| format!("Query settings: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Collect bookmarks
    let mut bookmarks_stmt = conn
        .prepare("SELECT id, project_id, label, command, tags, created_at FROM command_bookmarks ORDER BY id")
        .map_err(|e| format!("Prepare bookmarks: {}", e))?;

    let bookmarks: Vec<serde_json::Value> = bookmarks_stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let project_id: Option<i64> = row.get(1)?;
            let label: String = row.get(2)?;
            let command: String = row.get(3)?;
            let tags: String = row.get(4)?;
            let created_at: String = row.get(5)?;
            Ok(serde_json::json!({
                "id": id,
                "project_id": project_id,
                "label": label,
                "command": command,
                "tags": tags,
                "created_at": created_at,
            }))
        })
        .map_err(|e| format!("Query bookmarks: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let backup_data = serde_json::json!({
        "version": 1,
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "settings": settings,
        "bookmarks": bookmarks,
    });

    let dir = backup_dir()?;
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("workroot_backup_{}.json", timestamp);
    let filepath = dir.join(&filename);

    let json_str = serde_json::to_string_pretty(&backup_data)
        .map_err(|e| format!("Serialize backup: {}", e))?;

    fs::write(&filepath, &json_str).map_err(|e| format!("Write backup: {}", e))?;

    let metadata = fs::metadata(&filepath).map_err(|e| format!("Read metadata: {}", e))?;

    Ok(BackupInfo {
        path: filepath.to_string_lossy().to_string(),
        size_bytes: metadata.len(),
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Import settings and bookmarks from a JSON backup file.
#[tauri::command]
pub async fn import_backup(db: State<'_, AppDb>, path: String) -> Result<(), String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Read backup file: {}", e))?;

    let data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Parse backup: {}", e))?;

    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Restore settings
    if let Some(settings) = data.get("settings").and_then(|s| s.as_array()) {
        for entry in settings {
            let key = entry
                .get("key")
                .and_then(|k| k.as_str())
                .ok_or("Invalid setting entry: missing key")?;
            let value = entry
                .get("value")
                .and_then(|v| v.as_str())
                .ok_or("Invalid setting entry: missing value")?;

            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                rusqlite::params![key, value],
            )
            .map_err(|e| format!("Restore setting '{}': {}", key, e))?;
        }
    }

    // Restore bookmarks (skip duplicates based on label+command)
    if let Some(bookmarks) = data.get("bookmarks").and_then(|b| b.as_array()) {
        for entry in bookmarks {
            let project_id = entry.get("project_id").and_then(|p| p.as_i64());
            let label = entry
                .get("label")
                .and_then(|l| l.as_str())
                .ok_or("Invalid bookmark: missing label")?;
            let command = entry
                .get("command")
                .and_then(|c| c.as_str())
                .ok_or("Invalid bookmark: missing command")?;
            let tags = entry.get("tags").and_then(|t| t.as_str()).unwrap_or("");

            // Only insert if not a duplicate
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM command_bookmarks WHERE label = ?1 AND command = ?2",
                    rusqlite::params![label, command],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !exists {
                conn.execute(
                    "INSERT INTO command_bookmarks (project_id, label, command, tags) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![project_id, label, command, tags],
                )
                .map_err(|e| format!("Restore bookmark '{}': {}", label, e))?;
            }
        }
    }

    Ok(())
}

/// List all existing backup files.
#[tauri::command]
pub fn list_backups() -> Result<Vec<BackupInfo>, String> {
    let dir = backup_dir()?;
    let mut backups = Vec::new();

    let entries = fs::read_dir(&dir).map_err(|e| format!("Read backup dir: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Read dir entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) == Some("json")
            && path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("workroot_backup_"))
        {
            let metadata = fs::metadata(&path).map_err(|e| format!("Read metadata: {}", e))?;

            // Extract timestamp from filename
            let created_at = metadata
                .modified()
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.to_rfc3339()
                })
                .unwrap_or_default();

            backups.push(BackupInfo {
                path: path.to_string_lossy().to_string(),
                size_bytes: metadata.len(),
                created_at,
            });
        }
    }

    // Sort by created_at descending (most recent first)
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(backups)
}
