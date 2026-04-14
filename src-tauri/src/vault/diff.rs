use crate::db::AppDb;
use rusqlite::params;
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct EnvDiffEntry {
    pub key: String,
    pub status: String,
    pub left_value: Option<String>,
    pub right_value: Option<String>,
}

/// Compare two env profiles, showing which keys were added, removed, changed, or unchanged.
/// Values are masked as "***" for security.
#[tauri::command]
pub fn compare_env_profiles(
    db: State<'_, AppDb>,
    profile_id_a: i64,
    profile_id_b: i64,
) -> Result<Vec<EnvDiffEntry>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Load vars for profile A
    let mut stmt_a = conn
        .prepare("SELECT key, encrypted_value FROM env_vars WHERE profile_id = ?1 ORDER BY key")
        .map_err(|e| format!("DB: {}", e))?;
    let vars_a: HashMap<String, Option<String>> = stmt_a
        .query_map(params![profile_id_a], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| format!("DB: {}", e))?
        .collect::<Result<HashMap<_, _>, _>>()
        .map_err(|e| format!("DB: {}", e))?;

    // Load vars for profile B
    let mut stmt_b = conn
        .prepare("SELECT key, encrypted_value FROM env_vars WHERE profile_id = ?1 ORDER BY key")
        .map_err(|e| format!("DB: {}", e))?;
    let vars_b: HashMap<String, Option<String>> = stmt_b
        .query_map(params![profile_id_b], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| format!("DB: {}", e))?
        .collect::<Result<HashMap<_, _>, _>>()
        .map_err(|e| format!("DB: {}", e))?;

    let mut result = Vec::new();

    // Keys in A
    for (key, val_a) in &vars_a {
        if let Some(val_b) = vars_b.get(key) {
            if val_a == val_b {
                result.push(EnvDiffEntry {
                    key: key.clone(),
                    status: "unchanged".to_string(),
                    left_value: Some("***".to_string()),
                    right_value: Some("***".to_string()),
                });
            } else {
                result.push(EnvDiffEntry {
                    key: key.clone(),
                    status: "changed".to_string(),
                    left_value: Some("***".to_string()),
                    right_value: Some("***".to_string()),
                });
            }
        } else {
            result.push(EnvDiffEntry {
                key: key.clone(),
                status: "removed".to_string(),
                left_value: Some("***".to_string()),
                right_value: None,
            });
        }
    }

    // Keys only in B (added)
    for key in vars_b.keys() {
        if !vars_a.contains_key(key) {
            result.push(EnvDiffEntry {
                key: key.clone(),
                status: "added".to_string(),
                left_value: None,
                right_value: Some("***".to_string()),
            });
        }
    }

    result.sort_by(|a, b| a.key.cmp(&b.key));

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_test_db, AppDb};

    fn setup_db() -> AppDb {
        let conn = init_test_db();
        conn.execute(
            "INSERT INTO projects (id, name, local_path) VALUES (1, 'test', '/tmp')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO env_profiles (id, project_id, name) VALUES (1, 1, 'dev')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO env_profiles (id, project_id, name) VALUES (2, 1, 'prod')",
            [],
        )
        .unwrap();
        AppDb(std::sync::Arc::new(std::sync::Mutex::new(conn)))
    }

    /// Helper: run the diff logic directly against the connection.
    fn do_compare(db: &AppDb, profile_a: i64, profile_b: i64) -> Vec<EnvDiffEntry> {
        let conn = db.0.lock().unwrap();

        let mut stmt_a = conn
            .prepare("SELECT key, encrypted_value FROM env_vars WHERE profile_id = ?1 ORDER BY key")
            .unwrap();
        let vars_a: HashMap<String, Option<String>> = stmt_a
            .query_map(params![profile_a], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .unwrap()
            .collect::<Result<HashMap<_, _>, _>>()
            .unwrap();

        let mut stmt_b = conn
            .prepare("SELECT key, encrypted_value FROM env_vars WHERE profile_id = ?1 ORDER BY key")
            .unwrap();
        let vars_b: HashMap<String, Option<String>> = stmt_b
            .query_map(params![profile_b], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .unwrap()
            .collect::<Result<HashMap<_, _>, _>>()
            .unwrap();

        let mut result = Vec::new();

        for (key, val_a) in &vars_a {
            if let Some(val_b) = vars_b.get(key) {
                if val_a == val_b {
                    result.push(EnvDiffEntry {
                        key: key.clone(),
                        status: "unchanged".to_string(),
                        left_value: Some("***".to_string()),
                        right_value: Some("***".to_string()),
                    });
                } else {
                    result.push(EnvDiffEntry {
                        key: key.clone(),
                        status: "changed".to_string(),
                        left_value: Some("***".to_string()),
                        right_value: Some("***".to_string()),
                    });
                }
            } else {
                result.push(EnvDiffEntry {
                    key: key.clone(),
                    status: "removed".to_string(),
                    left_value: Some("***".to_string()),
                    right_value: None,
                });
            }
        }

        for key in vars_b.keys() {
            if !vars_a.contains_key(key) {
                result.push(EnvDiffEntry {
                    key: key.clone(),
                    status: "added".to_string(),
                    left_value: None,
                    right_value: Some("***".to_string()),
                });
            }
        }

        result.sort_by(|a, b| a.key.cmp(&b.key));
        result
    }

    #[test]
    fn test_compare_identical_profiles() {
        let db = setup_db();
        {
            let conn = db.0.lock().unwrap();
            // Same keys and same values in both profiles
            conn.execute(
                "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (1, 'DB_HOST', 'enc_localhost')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (1, 'API_KEY', 'enc_abc123')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (2, 'DB_HOST', 'enc_localhost')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (2, 'API_KEY', 'enc_abc123')",
                [],
            ).unwrap();
        }

        let diff = do_compare(&db, 1, 2);
        assert_eq!(diff.len(), 2);
        assert!(diff.iter().all(|e| e.status == "unchanged"));
        // Sorted by key
        assert_eq!(diff[0].key, "API_KEY");
        assert_eq!(diff[1].key, "DB_HOST");
    }

    #[test]
    fn test_compare_added_removed() {
        let db = setup_db();
        {
            let conn = db.0.lock().unwrap();
            // Profile A has ONLY_IN_A, profile B has ONLY_IN_B
            conn.execute(
                "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (1, 'ONLY_IN_A', 'enc_val_a')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (2, 'ONLY_IN_B', 'enc_val_b')",
                [],
            ).unwrap();
        }

        let diff = do_compare(&db, 1, 2);
        assert_eq!(diff.len(), 2);

        let added = diff.iter().find(|e| e.key == "ONLY_IN_B").unwrap();
        assert_eq!(added.status, "added");
        assert_eq!(added.left_value, None);
        assert_eq!(added.right_value, Some("***".to_string()));

        let removed = diff.iter().find(|e| e.key == "ONLY_IN_A").unwrap();
        assert_eq!(removed.status, "removed");
        assert_eq!(removed.left_value, Some("***".to_string()));
        assert_eq!(removed.right_value, None);
    }

    #[test]
    fn test_compare_changed() {
        let db = setup_db();
        {
            let conn = db.0.lock().unwrap();
            // Same key, different encrypted values
            conn.execute(
                "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (1, 'DB_HOST', 'enc_localhost')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (2, 'DB_HOST', 'enc_production_host')",
                [],
            ).unwrap();
            // Same key, same value (for contrast)
            conn.execute(
                "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (1, 'APP_NAME', 'enc_myapp')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (2, 'APP_NAME', 'enc_myapp')",
                [],
            ).unwrap();
        }

        let diff = do_compare(&db, 1, 2);
        assert_eq!(diff.len(), 2);

        let changed = diff.iter().find(|e| e.key == "DB_HOST").unwrap();
        assert_eq!(changed.status, "changed");
        // Values are masked
        assert_eq!(changed.left_value, Some("***".to_string()));
        assert_eq!(changed.right_value, Some("***".to_string()));

        let unchanged = diff.iter().find(|e| e.key == "APP_NAME").unwrap();
        assert_eq!(unchanged.status, "unchanged");
    }
}
