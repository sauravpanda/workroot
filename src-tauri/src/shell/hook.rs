use crate::db::queries;
use crate::db::AppDb;
use std::path::Path;
use tauri::{AppHandle, Manager};

use super::ShellCommand;

/// Receives a command payload from the shell hook, matches it to a project,
/// and stores it in shell_history.
pub fn receive_command(app: &AppHandle, payload: ShellCommand) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Match cwd to a registered project by checking if cwd starts with project path
    let projects = queries::list_projects(&conn).map_err(|e| format!("DB: {}", e))?;

    let matched = find_project_for_cwd(&projects, &payload.cwd);

    let (project_id, branch) = match matched {
        Some((pid, br)) => (pid, br),
        None => return Err("No matching project for cwd".into()),
    };

    let id = queries::insert_shell_history(
        &conn,
        project_id,
        &payload.command,
        payload.exit_code,
        branch.as_deref(),
        Some(&payload.cwd),
    )
    .map_err(|e| format!("DB insert: {}", e))?;

    // Enforce retention: keep last 10,000 per project
    enforce_retention(&conn, project_id);

    Ok(id)
}

/// Find the best matching project for a working directory.
/// Returns (project_id, Option<branch>) if found.
fn find_project_for_cwd(
    projects: &[queries::ProjectRow],
    cwd: &str,
) -> Option<(i64, Option<String>)> {
    let cwd_path = Path::new(cwd);

    // Find the project whose local_path is the longest prefix of cwd
    let mut best: Option<(i64, usize)> = None;

    for project in projects {
        let project_path = Path::new(&project.local_path);
        if cwd_path.starts_with(project_path) {
            let len = project.local_path.len();
            if best.is_none() || len > best.unwrap().1 {
                best = Some((project.id, len));
            }
        }
    }

    let project_id = best?.0;

    // Try to detect git branch from cwd
    let branch = detect_branch(cwd_path);

    Some((project_id, branch))
}

/// Detects the current git branch by reading .git/HEAD.
fn detect_branch(path: &Path) -> Option<String> {
    // Walk up from path looking for .git
    let mut current = Some(path);
    while let Some(dir) = current {
        let git_head = dir.join(".git/HEAD");
        if git_head.exists() {
            if let Ok(content) = std::fs::read_to_string(&git_head) {
                let content = content.trim();
                if let Some(branch) = content.strip_prefix("ref: refs/heads/") {
                    return Some(branch.to_string());
                }
                // Detached HEAD — return short hash
                return Some(content.chars().take(8).collect());
            }
        }
        // Check if this is a git worktree (has .git file pointing elsewhere)
        let git_file = dir.join(".git");
        if git_file.is_file() {
            if let Ok(content) = std::fs::read_to_string(&git_file) {
                let content = content.trim();
                if let Some(gitdir) = content.strip_prefix("gitdir: ") {
                    let head_path = Path::new(gitdir).join("HEAD");
                    if let Ok(head) = std::fs::read_to_string(&head_path) {
                        let head = head.trim();
                        if let Some(branch) = head.strip_prefix("ref: refs/heads/") {
                            return Some(branch.to_string());
                        }
                        return Some(head.chars().take(8).collect());
                    }
                }
            }
        }
        current = dir.parent();
    }
    None
}

/// Keep at most 10,000 shell history entries per project.
fn enforce_retention(conn: &rusqlite::Connection, project_id: i64) {
    let _ = conn.execute(
        "DELETE FROM shell_history WHERE id IN (
            SELECT id FROM shell_history
            WHERE project_id = ?1
            ORDER BY id DESC
            LIMIT -1 OFFSET 10000
        )",
        rusqlite::params![project_id],
    );
}

/// Shell types supported for hook installation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellType {
    Zsh,
    Fish,
}

impl ShellType {
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "zsh" => Some(Self::Zsh),
            "fish" => Some(Self::Fish),
            _ => None,
        }
    }
}

const HOOK_MARKER_START: &str = "# >>> workroot shell hook >>>";
const HOOK_MARKER_END: &str = "# <<< workroot shell hook <<<";

/// Install the shell hook for the given shell type.
pub fn install_hook(shell_type: ShellType) -> Result<String, String> {
    match shell_type {
        ShellType::Zsh => install_zsh_hook(),
        ShellType::Fish => install_fish_hook(),
    }
}

/// Remove the shell hook for the given shell type.
pub fn uninstall_hook(shell_type: ShellType) -> Result<(), String> {
    match shell_type {
        ShellType::Zsh => uninstall_zsh_hook(),
        ShellType::Fish => uninstall_fish_hook(),
    }
}

fn install_zsh_hook() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let zshrc = Path::new(&home).join(".zshrc");

    // Check if already installed
    if zshrc.exists() {
        let content = std::fs::read_to_string(&zshrc).map_err(|e| format!("Read .zshrc: {}", e))?;
        if content.contains(HOOK_MARKER_START) {
            return Ok("Hook already installed in .zshrc".into());
        }
    }

    let hook_block = format!(
        "\n{}\nsource \"$HOME/.config/workroot/shell-hook.sh\" 2>/dev/null\n{}\n",
        HOOK_MARKER_START, HOOK_MARKER_END,
    );

    // Ensure config dir exists
    let config_dir = Path::new(&home).join(".config/workroot");
    std::fs::create_dir_all(&config_dir).map_err(|e| format!("Create config dir: {}", e))?;

    // Copy the hook script to config dir
    let hook_script = include_str!("../../../scripts/workroot-shell-hook.sh");
    let dest = config_dir.join("shell-hook.sh");
    std::fs::write(&dest, hook_script).map_err(|e| format!("Write hook script: {}", e))?;

    // Append to .zshrc
    let mut zshrc_content = if zshrc.exists() {
        std::fs::read_to_string(&zshrc).map_err(|e| format!("Read .zshrc: {}", e))?
    } else {
        String::new()
    };

    zshrc_content.push_str(&hook_block);
    std::fs::write(&zshrc, zshrc_content).map_err(|e| format!("Write .zshrc: {}", e))?;

    Ok("Hook installed in .zshrc".into())
}

fn install_fish_hook() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let conf_d = Path::new(&home).join(".config/fish/conf.d");
    std::fs::create_dir_all(&conf_d).map_err(|e| format!("Create conf.d: {}", e))?;

    let dest = conf_d.join("workroot.fish");
    if dest.exists() {
        return Ok("Hook already installed for fish".into());
    }

    let hook_script = include_str!("../../../scripts/workroot-shell-hook.fish");
    std::fs::write(&dest, hook_script).map_err(|e| format!("Write fish hook: {}", e))?;

    Ok("Hook installed for fish".into())
}

fn uninstall_zsh_hook() -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let zshrc = Path::new(&home).join(".zshrc");

    if !zshrc.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&zshrc).map_err(|e| format!("Read .zshrc: {}", e))?;

    if !content.contains(HOOK_MARKER_START) {
        return Ok(());
    }

    // Remove the block between markers (inclusive)
    let mut result = String::new();
    let mut inside_block = false;

    for line in content.lines() {
        if line.trim() == HOOK_MARKER_START {
            inside_block = true;
            continue;
        }
        if line.trim() == HOOK_MARKER_END {
            inside_block = false;
            continue;
        }
        if !inside_block {
            result.push_str(line);
            result.push('\n');
        }
    }

    std::fs::write(&zshrc, result).map_err(|e| format!("Write .zshrc: {}", e))?;

    // Remove config script
    let config_script = Path::new(&home).join(".config/workroot/shell-hook.sh");
    let _ = std::fs::remove_file(config_script);

    Ok(())
}

fn uninstall_fish_hook() -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let dest = Path::new(&home).join(".config/fish/conf.d/workroot.fish");
    let _ = std::fs::remove_file(dest);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_test_db;

    #[test]
    fn find_project_matches_cwd() {
        let projects = vec![
            queries::ProjectRow {
                id: 1,
                name: "app".into(),
                github_url: None,
                local_path: "/home/user/projects/app".into(),
                framework: None,
                created_at: String::new(),
                updated_at: String::new(),
            },
            queries::ProjectRow {
                id: 2,
                name: "other".into(),
                github_url: None,
                local_path: "/home/user/other".into(),
                framework: None,
                created_at: String::new(),
                updated_at: String::new(),
            },
        ];

        // Exact match
        let result = find_project_for_cwd(&projects, "/home/user/projects/app");
        assert_eq!(result.unwrap().0, 1);

        // Subdirectory match
        let result = find_project_for_cwd(&projects, "/home/user/projects/app/src/components");
        assert_eq!(result.unwrap().0, 1);

        // Other project
        let result = find_project_for_cwd(&projects, "/home/user/other/deep/path");
        assert_eq!(result.unwrap().0, 2);

        // No match
        let result = find_project_for_cwd(&projects, "/tmp/random");
        assert!(result.is_none());
    }

    #[test]
    fn longest_prefix_wins() {
        let projects = vec![
            queries::ProjectRow {
                id: 1,
                name: "parent".into(),
                github_url: None,
                local_path: "/home/user".into(),
                framework: None,
                created_at: String::new(),
                updated_at: String::new(),
            },
            queries::ProjectRow {
                id: 2,
                name: "child".into(),
                github_url: None,
                local_path: "/home/user/projects/app".into(),
                framework: None,
                created_at: String::new(),
                updated_at: String::new(),
            },
        ];

        let result = find_project_for_cwd(&projects, "/home/user/projects/app/src");
        assert_eq!(result.unwrap().0, 2); // More specific match wins
    }

    #[test]
    fn retention_enforcement() {
        let conn = init_test_db();
        let pid = queries::insert_project(&conn, "test", "/tmp/test", None, None).unwrap();

        // Insert 15 entries
        for i in 0..15 {
            queries::insert_shell_history(
                &conn,
                pid,
                &format!("cmd {}", i),
                Some(0),
                Some("main"),
                Some("/tmp/test"),
            )
            .unwrap();
        }

        // Verify all 15 exist
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM shell_history WHERE project_id = ?1",
                rusqlite::params![pid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 15);

        // Retention with limit 10000 should not delete anything
        enforce_retention(&conn, pid);

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM shell_history WHERE project_id = ?1",
                rusqlite::params![pid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 15); // All kept (under 10,000)
    }

    #[test]
    fn shell_type_from_str() {
        assert_eq!(ShellType::parse("zsh"), Some(ShellType::Zsh));
        assert_eq!(ShellType::parse("ZSH"), Some(ShellType::Zsh));
        assert_eq!(ShellType::parse("fish"), Some(ShellType::Fish));
        assert_eq!(ShellType::parse("bash"), None);
    }
}
