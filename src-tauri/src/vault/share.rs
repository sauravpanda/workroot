use super::crypto;
use crate::db::AppDb;
use crate::github::auth;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize)]
pub struct ShareResult {
    pub gist_url: String,
    pub gist_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SharedProfile {
    pub profile_name: String,
    pub variable_count: usize,
    pub created_at: String,
    pub encrypted_data: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SharedVar {
    pub key: String,
    pub encrypted_value: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SharedGist {
    pub id: String,
    pub url: String,
    pub description: String,
    pub created_at: String,
}

/// Export an env profile as an encrypted GitHub Gist.
#[tauri::command]
pub async fn export_profile_to_gist(
    db: State<'_, AppDb>,
    profile_id: i64,
    passphrase: String,
) -> Result<ShareResult, String> {
    let (profile_name, project_id, vars) = {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

        // Get profile info
        let (name, pid): (String, i64) = conn
            .query_row(
                "SELECT name, project_id FROM env_profiles WHERE id = ?1",
                params![profile_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Profile not found: {}", e))?;

        // Get vars with encrypted values
        let mut stmt = conn
            .prepare("SELECT key, encrypted_value FROM env_vars WHERE profile_id = ?1")
            .map_err(|e| format!("Query: {}", e))?;

        let rows = stmt
            .query_map(params![profile_id], |row| {
                Ok(SharedVar {
                    key: row.get(0)?,
                    encrypted_value: row.get(1)?,
                })
            })
            .map_err(|e| format!("Query: {}", e))?;

        let mut vars = Vec::new();
        for row in rows {
            vars.push(row.map_err(|e| format!("Row: {}", e))?);
        }

        (name, pid, vars)
    };

    let _ = project_id; // used for context, not needed in gist

    // Serialize vars and encrypt with passphrase
    let vars_json = serde_json::to_string(&vars).map_err(|e| format!("Serialize: {}", e))?;

    let key = derive_key_from_passphrase(&passphrase);
    let encrypted =
        crypto::encrypt_with_key(&vars_json, &key).map_err(|e| format!("Encrypt: {}", e))?;

    let shared = SharedProfile {
        profile_name: profile_name.clone(),
        variable_count: vars.len(),
        created_at: chrono::Utc::now().to_rfc3339(),
        encrypted_data: encrypted,
    };

    let content = serde_json::to_string_pretty(&shared).map_err(|e| format!("Serialize: {}", e))?;

    let token = auth::get_token()?.ok_or("Not authenticated with GitHub")?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.github.com/gists")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Workroot")
        .header("Accept", "application/vnd.github+json")
        .json(&serde_json::json!({
            "description": format!("Workroot env profile: {} ({} vars)", profile_name, vars.len()),
            "public": false,
            "files": {
                "workroot-env.json": {
                    "content": content
                }
            }
        }))
        .send()
        .await
        .map_err(|e| format!("Gist create: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API error ({}): {}", status, body));
    }

    #[derive(Deserialize)]
    struct GistResponse {
        id: String,
        html_url: String,
    }

    let gist: GistResponse = resp.json().await.map_err(|e| format!("Parse: {}", e))?;

    Ok(ShareResult {
        gist_url: gist.html_url,
        gist_id: gist.id,
    })
}

/// Import an env profile from an encrypted GitHub Gist.
#[tauri::command]
pub async fn import_profile_from_gist(
    db: State<'_, AppDb>,
    project_id: i64,
    gist_id: String,
    passphrase: String,
) -> Result<i64, String> {
    let token = auth::get_token()?.ok_or("Not authenticated with GitHub")?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("https://api.github.com/gists/{}", gist_id))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Workroot")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Gist fetch: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Failed to fetch gist: {}", resp.status()));
    }

    #[derive(Deserialize)]
    struct GistFile {
        content: String,
    }
    #[derive(Deserialize)]
    struct GistDetail {
        files: std::collections::HashMap<String, GistFile>,
    }

    let gist: GistDetail = resp.json().await.map_err(|e| format!("Parse: {}", e))?;

    let content = gist
        .files
        .get("workroot-env.json")
        .ok_or("Not a Workroot env profile gist")?;

    let shared: SharedProfile =
        serde_json::from_str(&content.content).map_err(|e| format!("Parse: {}", e))?;

    // Decrypt
    let key = derive_key_from_passphrase(&passphrase);
    let decrypted = crypto::decrypt_with_key(&shared.encrypted_data, &key)
        .map_err(|_| "Wrong passphrase".to_string())?;

    let vars: Vec<SharedVar> =
        serde_json::from_str(&decrypted).map_err(|e| format!("Parse vars: {}", e))?;

    // Create profile and import vars
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let profile_name = format!("{} (imported)", shared.profile_name);

    conn.execute(
        "INSERT INTO env_profiles (project_id, name) VALUES (?1, ?2)",
        params![project_id, &profile_name],
    )
    .map_err(|e| format!("Create profile: {}", e))?;

    let profile_id = conn.last_insert_rowid();

    for var in &vars {
        conn.execute(
            "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (?1, ?2, ?3)",
            params![profile_id, &var.key, &var.encrypted_value],
        )
        .map_err(|e| format!("Import var: {}", e))?;
    }

    Ok(profile_id)
}

/// List user's Workroot-related Gists.
#[tauri::command]
pub async fn list_shared_gists() -> Result<Vec<SharedGist>, String> {
    let token = auth::get_token()?.ok_or("Not authenticated with GitHub")?;

    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/gists")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Workroot")
        .header("Accept", "application/vnd.github+json")
        .query(&[("per_page", "100")])
        .send()
        .await
        .map_err(|e| format!("Fetch: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    #[derive(Deserialize)]
    struct GistItem {
        id: String,
        html_url: String,
        description: Option<String>,
        created_at: String,
        files: std::collections::HashMap<String, serde_json::Value>,
    }

    let gists: Vec<GistItem> = resp.json().await.map_err(|e| format!("Parse: {}", e))?;

    let workroot_gists: Vec<SharedGist> = gists
        .into_iter()
        .filter(|g| g.files.contains_key("workroot-env.json"))
        .map(|g| SharedGist {
            id: g.id,
            url: g.html_url,
            description: g.description.unwrap_or_default(),
            created_at: g.created_at,
        })
        .collect();

    Ok(workroot_gists)
}

/// Derive a 32-byte key from a passphrase using simple hash.
fn derive_key_from_passphrase(passphrase: &str) -> [u8; 32] {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut key = [0u8; 32];
    let bytes = passphrase.as_bytes();
    for (i, chunk) in key.chunks_mut(1).enumerate() {
        let mut hasher = DefaultHasher::new();
        bytes.hash(&mut hasher);
        i.hash(&mut hasher);
        chunk[0] = (hasher.finish() & 0xFF) as u8;
    }
    key
}
