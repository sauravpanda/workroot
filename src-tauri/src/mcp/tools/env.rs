use crate::db::queries;
use crate::db::AppDb;
use crate::vault::crypto;
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// Returns env var keys (not values) for a worktree's project profiles.
pub fn get_env_vars(app: &AppHandle, worktree_id: i64) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    let profiles = queries::list_env_profiles(&conn, worktree.project_id)
        .map_err(|e| format!("DB error: {}", e))?;

    let mut result = Vec::new();
    for profile in &profiles {
        let vars = queries::list_env_var_keys(&conn, profile.id)
            .map_err(|e| format!("DB error: {}", e))?;

        let keys: Vec<&str> = vars.iter().map(|v| v.key.as_str()).collect();

        result.push(serde_json::json!({
            "profile_id": profile.id,
            "profile_name": profile.name,
            "keys": keys,
        }));
    }

    Ok(serde_json::json!({ "profiles": result }))
}

/// Returns the decrypted value of a specific env var key.
pub fn get_env_var_value(app: &AppHandle, worktree_id: i64, key: &str) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    let profiles = queries::list_env_profiles(&conn, worktree.project_id)
        .map_err(|e| format!("DB error: {}", e))?;

    // Search all profiles for the key
    for profile in &profiles {
        let vars = queries::list_env_vars_with_values(&conn, profile.id)
            .map_err(|e| format!("DB error: {}", e))?;

        for var in &vars {
            if var.key == key {
                let value = match &var.encrypted_value {
                    Some(enc) => crypto::decrypt(enc)?,
                    None => String::new(),
                };

                return Ok(serde_json::json!({
                    "key": key,
                    "value": value,
                    "profile_name": profile.name,
                    "profile_id": profile.id,
                }));
            }
        }
    }

    Err(format!("Env var '{}' not found", key))
}
