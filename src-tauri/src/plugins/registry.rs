use crate::db::AppDb;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub enabled: bool,
}

/// List all installed plugins from the settings store.
#[tauri::command]
pub fn list_plugins(db: State<'_, AppDb>) -> Result<Vec<PluginManifest>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = 'installed_plugins'",
        [],
        |row| row.get::<_, String>(0),
    );

    match result {
        Ok(json_str) => {
            let plugins: Vec<PluginManifest> =
                serde_json::from_str(&json_str).map_err(|e| format!("Parse plugins: {}", e))?;
            Ok(plugins)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(vec![]),
        Err(e) => Err(format!("Query plugins: {}", e)),
    }
}

/// Enable or disable a plugin by ID.
#[tauri::command]
pub fn toggle_plugin(db: State<'_, AppDb>, plugin_id: String, enabled: bool) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Read current plugins list
    let json_str = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'installed_plugins'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| format!("Read plugins: {}", e))?;

    let mut plugins: Vec<PluginManifest> =
        serde_json::from_str(&json_str).map_err(|e| format!("Parse plugins: {}", e))?;

    let found = plugins.iter_mut().find(|p| p.id == plugin_id);
    match found {
        Some(plugin) => {
            plugin.enabled = enabled;
        }
        None => {
            return Err(format!("Plugin not found: {}", plugin_id));
        }
    }

    let updated_json =
        serde_json::to_string(&plugins).map_err(|e| format!("Serialize plugins: {}", e))?;

    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('installed_plugins', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![updated_json],
    )
    .map_err(|e| format!("Update plugins: {}", e))?;

    Ok(())
}
