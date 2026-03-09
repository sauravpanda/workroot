pub mod crypto;

use crate::db::queries;
use crate::db::AppDb;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct DecryptedEnvVar {
    pub id: i64,
    pub profile_id: i64,
    pub key: String,
    pub value: String,
    pub created_at: String,
}

/// Encrypts and stores an env var in the vault.
#[tauri::command]
pub fn vault_store_env_var(
    db: State<'_, AppDb>,
    profile_id: i64,
    key: String,
    value: String,
) -> Result<i64, String> {
    let encrypted = crypto::encrypt(&value)?;
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::insert_env_var(&conn, profile_id, &key, Some(&encrypted))
        .map_err(|e| format!("Failed to store env var: {}", e))
}

/// Updates an existing env var's key and/or value.
#[tauri::command]
pub fn vault_update_env_var(
    db: State<'_, AppDb>,
    var_id: i64,
    key: String,
    value: String,
) -> Result<(), String> {
    let encrypted = crypto::encrypt(&value)?;
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::update_env_var(&conn, var_id, &key, &encrypted)
        .map_err(|e| format!("Failed to update env var: {}", e))
}

/// Retrieves and decrypts all env vars for a profile.
#[tauri::command]
pub fn vault_get_env_vars(
    db: State<'_, AppDb>,
    profile_id: i64,
) -> Result<Vec<DecryptedEnvVar>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let rows = queries::list_env_vars_with_values(&conn, profile_id)
        .map_err(|e| format!("DB error: {}", e))?;

    let mut vars = Vec::new();
    for row in rows {
        let value = if let Some(ref encrypted) = row.encrypted_value {
            crypto::decrypt(encrypted)?
        } else {
            String::new()
        };
        vars.push(DecryptedEnvVar {
            id: row.id,
            profile_id: row.profile_id,
            key: row.key,
            value,
            created_at: row.created_at,
        });
    }
    Ok(vars)
}

/// Deletes a single env var.
#[tauri::command]
pub fn vault_delete_env_var(db: State<'_, AppDb>, var_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_env_var(&conn, var_id).map_err(|e| format!("DB error: {}", e))
}

/// Creates an env profile for a project.
#[tauri::command]
pub fn vault_create_profile(
    db: State<'_, AppDb>,
    project_id: i64,
    name: String,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::insert_env_profile(&conn, project_id, &name)
        .map_err(|e| format!("Failed to create profile: {}", e))
}

/// Lists all env profiles for a project.
#[tauri::command]
pub fn vault_list_profiles(
    db: State<'_, AppDb>,
    project_id: i64,
) -> Result<Vec<queries::EnvProfileRow>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_env_profiles(&conn, project_id).map_err(|e| format!("DB error: {}", e))
}

/// Deletes an env profile and all its variables (cascade).
#[tauri::command]
pub fn vault_delete_profile(db: State<'_, AppDb>, profile_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_env_profile(&conn, profile_id).map_err(|e| format!("DB error: {}", e))
}

/// Duplicates a profile with all its variables.
#[tauri::command]
pub fn vault_duplicate_profile(
    db: State<'_, AppDb>,
    source_profile_id: i64,
    new_name: String,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Get source profile
    let source_vars = queries::list_env_vars_with_values(&conn, source_profile_id)
        .map_err(|e| format!("DB error: {}", e))?;

    // Get source profile's project_id
    let profiles = queries::list_env_profiles_all(&conn).map_err(|e| format!("DB error: {}", e))?;
    let source = profiles
        .iter()
        .find(|p| p.id == source_profile_id)
        .ok_or("Source profile not found")?;

    // Create new profile
    let new_id = queries::insert_env_profile(&conn, source.project_id, &new_name)
        .map_err(|e| format!("Failed to create profile: {}", e))?;

    // Copy all vars (already encrypted)
    for var in source_vars {
        queries::insert_env_var(&conn, new_id, &var.key, var.encrypted_value.as_deref())
            .map_err(|e| format!("Failed to copy var: {}", e))?;
    }

    Ok(new_id)
}
