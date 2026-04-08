use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSettingsSnapshot {
    pub shell: Option<String>,
    pub init_command: Option<String>,
    pub theme_id: Option<String>,
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

/// Get terminal-related settings in a single query path.
#[tauri::command]
pub fn get_terminal_settings(db: State<'_, AppDb>) -> Result<TerminalSettingsSnapshot, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    Ok(get_terminal_settings_value(&conn))
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

/// Helper (not a command): read terminal launch settings together.
pub fn get_terminal_settings_value(conn: &rusqlite::Connection) -> TerminalSettingsSnapshot {
    TerminalSettingsSnapshot {
        shell: get_setting_value(conn, "terminal_shell"),
        init_command: get_setting_value(conn, "terminal_init_command"),
        theme_id: get_setting_value(conn, "terminal_theme"),
    }
}

#[cfg(test)]
mod tests {
    use crate::db::init_test_db;
    use rusqlite::params;

    use super::{
        get_setting_value, get_terminal_settings_value, SettingEntry, TerminalSettingsSnapshot,
    };

    /// Helper: upsert a setting directly.
    fn set_setting(conn: &rusqlite::Connection, key: &str, value: &str) {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .unwrap();
    }

    /// Helper: get all settings.
    fn get_all(conn: &rusqlite::Connection) -> Vec<SettingEntry> {
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings ORDER BY key")
            .unwrap();
        stmt.query_map([], |row| {
            Ok(SettingEntry {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    }

    #[test]
    fn test_settings_create_and_get() {
        let conn = init_test_db();
        set_setting(&conn, "theme", "dark");

        let val = get_setting_value(&conn, "theme");
        assert_eq!(val, Some("dark".to_string()));
    }

    #[test]
    fn test_settings_get_missing_key() {
        let conn = init_test_db();
        let val = get_setting_value(&conn, "nonexistent");
        assert_eq!(val, None);
    }

    #[test]
    fn test_settings_upsert_overwrites() {
        let conn = init_test_db();
        set_setting(&conn, "lang", "en");
        set_setting(&conn, "lang", "fr");

        let val = get_setting_value(&conn, "lang");
        assert_eq!(val, Some("fr".to_string()));

        // Only one row should exist for that key
        let all = get_all(&conn);
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn test_settings_list_all() {
        let conn = init_test_db();
        set_setting(&conn, "editor", "vim");
        set_setting(&conn, "theme", "light");
        set_setting(&conn, "autosave", "true");

        let all = get_all(&conn);
        assert_eq!(all.len(), 3);
        // Ordered by key
        assert_eq!(all[0].key, "autosave");
        assert_eq!(all[1].key, "editor");
        assert_eq!(all[2].key, "theme");
    }

    #[test]
    fn test_settings_delete() {
        let conn = init_test_db();
        set_setting(&conn, "temp_key", "temp_val");

        conn.execute("DELETE FROM settings WHERE key = ?1", params!["temp_key"])
            .unwrap();

        let val = get_setting_value(&conn, "temp_key");
        assert_eq!(val, None);
    }

    #[test]
    fn test_terminal_settings_snapshot() {
        let conn = init_test_db();
        set_setting(&conn, "terminal_shell", "/bin/bash");
        set_setting(&conn, "terminal_init_command", "source ~/.profile");
        set_setting(&conn, "terminal_theme", "solarized");

        let snapshot = get_terminal_settings_value(&conn);

        assert_eq!(
            snapshot,
            TerminalSettingsSnapshot {
                shell: Some("/bin/bash".to_string()),
                init_command: Some("source ~/.profile".to_string()),
                theme_id: Some("solarized".to_string()),
            }
        );
    }
}
