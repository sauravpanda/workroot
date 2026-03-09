use std::path::Path;

/// Writes a `.mcp.json` file in the given directory for MCP client discovery.
pub fn write_mcp_json(dir: &Path, token: &str) -> Result<(), String> {
    let mcp_json = serde_json::json!({
        "mcpServers": {
            "workroot": {
                "url": "http://localhost:4444/mcp",
                "token": token
            }
        }
    });

    let content =
        serde_json::to_string_pretty(&mcp_json).map_err(|e| format!("JSON error: {}", e))?;

    let mcp_path = dir.join(".mcp.json");
    std::fs::write(&mcp_path, content).map_err(|e| format!("Failed to write .mcp.json: {}", e))?;

    // Ensure .mcp.json is gitignored
    ensure_gitignore(dir, ".mcp.json")?;

    Ok(())
}

/// Removes the `.mcp.json` file from a directory.
pub fn remove_mcp_json(dir: &Path) -> Result<(), String> {
    let mcp_path = dir.join(".mcp.json");
    if mcp_path.exists() {
        std::fs::remove_file(&mcp_path)
            .map_err(|e| format!("Failed to remove .mcp.json: {}", e))?;
    }
    Ok(())
}

/// Updates `.mcp.json` in all provided worktree paths with a new token.
pub fn update_all_mcp_json(worktree_paths: &[String], token: &str) -> Vec<String> {
    let mut errors = Vec::new();
    for path in worktree_paths {
        let dir = Path::new(path);
        if dir.exists() {
            if let Err(e) = write_mcp_json(dir, token) {
                errors.push(format!("{}: {}", path, e));
            }
        }
    }
    errors
}

/// Ensures a pattern is in the `.gitignore` file of a directory.
fn ensure_gitignore(dir: &Path, pattern: &str) -> Result<(), String> {
    let gitignore = dir.join(".gitignore");

    if gitignore.exists() {
        let content =
            std::fs::read_to_string(&gitignore).map_err(|e| format!("Read error: {}", e))?;

        if content.lines().any(|line| line.trim() == pattern) {
            return Ok(());
        }

        let separator = if content.ends_with('\n') { "" } else { "\n" };
        std::fs::write(&gitignore, format!("{}{}{}\n", content, separator, pattern))
            .map_err(|e| format!("Write error: {}", e))?;
    } else {
        std::fs::write(&gitignore, format!("{}\n", pattern))
            .map_err(|e| format!("Write error: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn write_and_read_mcp_json() {
        let dir = TempDir::new().unwrap();
        write_mcp_json(dir.path(), "test-token-abc123").unwrap();

        let content = std::fs::read_to_string(dir.path().join(".mcp.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(
            parsed["mcpServers"]["workroot"]["url"],
            "http://localhost:4444/mcp"
        );
        assert_eq!(
            parsed["mcpServers"]["workroot"]["token"],
            "test-token-abc123"
        );
    }

    #[test]
    fn mcp_json_gitignored() {
        let dir = TempDir::new().unwrap();
        write_mcp_json(dir.path(), "token").unwrap();

        let gitignore = std::fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert!(gitignore.contains(".mcp.json"));
    }

    #[test]
    fn remove_mcp_json_works() {
        let dir = TempDir::new().unwrap();
        write_mcp_json(dir.path(), "token").unwrap();
        assert!(dir.path().join(".mcp.json").exists());

        remove_mcp_json(dir.path()).unwrap();
        assert!(!dir.path().join(".mcp.json").exists());
    }

    #[test]
    fn update_all_updates_token() {
        let dir1 = TempDir::new().unwrap();
        let dir2 = TempDir::new().unwrap();

        write_mcp_json(dir1.path(), "old-token").unwrap();
        write_mcp_json(dir2.path(), "old-token").unwrap();

        let paths = vec![
            dir1.path().to_string_lossy().to_string(),
            dir2.path().to_string_lossy().to_string(),
        ];
        let errors = update_all_mcp_json(&paths, "new-token");
        assert!(errors.is_empty());

        let content = std::fs::read_to_string(dir1.path().join(".mcp.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["mcpServers"]["workroot"]["token"], "new-token");
    }
}
