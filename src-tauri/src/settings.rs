use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingEntry {
    pub key: String,
    pub value: String,
}

/// Get a single setting value by key.
#[tauri::command]
pub fn get_setting(db: State<'_, AppDb>, key: String) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query error: {}", e)),
    }
}

/// Set a setting value. Creates or updates.
#[tauri::command]
pub fn set_setting(db: State<'_, AppDb>, key: String, value: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| format!("Upsert error: {}", e))?;
    Ok(())
}

/// Get all settings as a list.
#[tauri::command]
pub fn get_all_settings(db: State<'_, AppDb>) -> Result<Vec<SettingEntry>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings ORDER BY key")
        .map_err(|e| format!("Query: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SettingEntry {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    Ok(results)
}

/// Delete a setting.
#[tauri::command]
pub fn delete_setting(db: State<'_, AppDb>, key: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])
        .map_err(|e| format!("Delete: {}", e))?;
    Ok(())
}

/// Helper (not a command): read a setting from a connection directly.
/// Used by other modules that need config values.
pub fn get_setting_value(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .ok()
}
