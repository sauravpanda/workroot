use crate::db::queries;
use crate::db::AppDb;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::State;

use super::crypto;

const HEADER: &str = "# Managed by Workroot \u{2014} do not edit manually\n";

#[derive(Debug, Serialize)]
pub struct SynthesisResult {
    pub path: String,
    pub var_count: usize,
}

/// Writes a .env file for a worktree using decrypted vars from the given profile.
fn write_env_file(
    env_path: &Path,
    profile_id: i64,
    conn: &rusqlite::Connection,
) -> Result<SynthesisResult, String> {
    let rows = queries::list_env_vars_with_values(conn, profile_id)
        .map_err(|e| format!("DB error: {}", e))?;

    let mut content = String::from(HEADER);
    let mut count = 0;

    for row in &rows {
        let value = if let Some(ref encrypted) = row.encrypted_value {
            crypto::decrypt(encrypted)?
        } else {
            String::new()
        };
        // Quote values containing spaces, #, or newlines
        if value.contains(' ') || value.contains('#') || value.contains('\n') {
            content.push_str(&format!("{}=\"{}\"\n", row.key, value.replace('"', "\\\"")));
        } else {
            content.push_str(&format!("{}={}\n", row.key, value));
        }
        count += 1;
    }

    let mut file =
        fs::File::create(env_path).map_err(|e| format!("Failed to create .env file: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write .env file: {}", e))?;

    // Set permissions to owner-read-write only on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o600);
        fs::set_permissions(env_path, perms)
            .map_err(|e| format!("Failed to set file permissions: {}", e))?;
    }

    Ok(SynthesisResult {
        path: env_path.to_string_lossy().to_string(),
        var_count: count,
    })
}

/// Ensures .env is listed in the worktree's .gitignore.
fn ensure_gitignore(worktree_path: &Path) {
    let gitignore_path = worktree_path.join(".gitignore");
    let content = fs::read_to_string(&gitignore_path).unwrap_or_default();

    if !content.lines().any(|line| line.trim() == ".env") {
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&gitignore_path)
            .ok();
        if let Some(ref mut f) = file {
            // Add newline before if file doesn't end with one
            if !content.is_empty() && !content.ends_with('\n') {
                let _ = f.write_all(b"\n");
            }
            let _ = f.write_all(b".env\n");
        }
    }
}

/// Synthesizes a .env file in the worktree from the given profile.
#[tauri::command]
pub fn synthesize_env_file(
    db: State<'_, AppDb>,
    worktree_id: i64,
    profile_id: i64,
) -> Result<SynthesisResult, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    let wt_path = Path::new(&worktree.path);
    if !wt_path.exists() {
        return Err(format!("Worktree path does not exist: {}", worktree.path));
    }

    let env_path = wt_path.join(".env");
    let result = write_env_file(&env_path, profile_id, &conn)?;

    ensure_gitignore(wt_path);

    Ok(result)
}

/// Removes a synthesized .env file from a worktree.
#[tauri::command]
pub fn remove_env_file(db: State<'_, AppDb>, worktree_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    let env_path = Path::new(&worktree.path).join(".env");
    if env_path.exists() {
        fs::remove_file(&env_path).map_err(|e| format!("Failed to remove .env file: {}", e))?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn ensure_gitignore_creates_file() {
        let dir = TempDir::new().unwrap();
        ensure_gitignore(dir.path());

        let content = fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert!(content.contains(".env"));
    }

    #[test]
    fn ensure_gitignore_appends() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(".gitignore"), "node_modules/\n").unwrap();
        ensure_gitignore(dir.path());

        let content = fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert!(content.contains("node_modules/"));
        assert!(content.contains(".env"));
    }

    #[test]
    fn ensure_gitignore_no_duplicate() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(".gitignore"), ".env\nnode_modules/\n").unwrap();
        ensure_gitignore(dir.path());

        let content = fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert_eq!(content.matches(".env").count(), 1);
    }
}
