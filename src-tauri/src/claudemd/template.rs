use crate::db::queries;
use crate::memory::dead_ends::DeadEnd;
use crate::process::detect;
use rusqlite::Connection;
use std::fmt::Write;
use std::path::Path;

/// Maximum chars for the memory section to avoid CLAUDE.md bloat.
const MEMORY_BUDGET: usize = 4000;

/// Generates the full CLAUDE.md content for a worktree.
pub fn generate_claude_md(conn: &Connection, worktree_id: i64) -> Result<String, String> {
    let worktree = queries::get_worktree(conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    let project = queries::get_project(conn, worktree.project_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found")?;

    let mut md = String::new();

    // Header
    writeln!(
        md,
        "<!-- Managed by Workroot — regenerated automatically -->"
    )
    .unwrap();
    writeln!(md).unwrap();
    writeln!(md, "# {}", project.name).unwrap();
    writeln!(md).unwrap();

    // Project overview
    writeln!(md, "## Project Overview").unwrap();
    writeln!(md).unwrap();
    writeln!(md, "- **Path**: `{}`", project.local_path).unwrap();
    if let Some(ref url) = project.github_url {
        writeln!(md, "- **GitHub**: {}", url).unwrap();
    }
    if let Some(ref fw) = project.framework {
        writeln!(md, "- **Framework**: {}", fw).unwrap();
    }
    writeln!(md).unwrap();

    // Tech stack
    let wt_path = Path::new(&worktree.path);
    let project_path = Path::new(&project.local_path);
    let detect_path = if wt_path.exists() {
        wt_path
    } else {
        project_path
    };

    if let Some(framework) = detect::detect_framework(detect_path) {
        writeln!(md, "## Tech Stack").unwrap();
        writeln!(md).unwrap();
        writeln!(md, "- **Framework**: {}", framework.name).unwrap();
        writeln!(md, "- **Dev Command**: `{}`", framework.dev_command).unwrap();
        if let Some(ref pm) = framework.package_manager {
            writeln!(md, "- **Package Manager**: {}", pm).unwrap();
        }
        if let Some(port) = framework.default_port {
            writeln!(md, "- **Default Port**: {}", port).unwrap();
        }
        writeln!(md).unwrap();
    }

    // Dev server status
    let processes =
        queries::list_processes(conn, worktree_id).map_err(|e| format!("DB error: {}", e))?;
    let running = processes.iter().find(|p| p.status == "running");

    if let Some(proc) = running {
        writeln!(md, "## Dev Server").unwrap();
        writeln!(md).unwrap();
        writeln!(md, "- **Status**: Running").unwrap();
        writeln!(md, "- **Command**: `{}`", proc.command).unwrap();
        if let Some(port) = proc.port {
            writeln!(md, "- **Port**: {}", port).unwrap();
            writeln!(md, "- **URL**: http://localhost:{}", port).unwrap();
        }
        if let Some(ref started) = proc.started_at {
            writeln!(md, "- **Started**: {}", started).unwrap();
        }
        writeln!(md).unwrap();
    }

    // Environment
    let profiles = queries::list_env_profiles(conn, worktree.project_id)
        .map_err(|e| format!("DB error: {}", e))?;

    if !profiles.is_empty() {
        writeln!(md, "## Environment Variables").unwrap();
        writeln!(md).unwrap();

        for profile in &profiles {
            let vars = queries::list_env_var_keys(conn, profile.id)
                .map_err(|e| format!("DB error: {}", e))?;

            if !vars.is_empty() {
                writeln!(md, "**Profile: {}**", profile.name).unwrap();
                writeln!(md).unwrap();
                for var in &vars {
                    writeln!(md, "- `{}`", var.key).unwrap();
                }
                writeln!(md).unwrap();
            }
        }
    }

    // Git context
    writeln!(md, "## Git Context").unwrap();
    writeln!(md).unwrap();
    writeln!(md, "- **Branch**: `{}`", worktree.branch_name).unwrap();
    writeln!(md, "- **Worktree Path**: `{}`", worktree.path).unwrap();
    writeln!(md).unwrap();

    // Active worktrees
    let all_worktrees = queries::list_worktrees(conn, worktree.project_id)
        .map_err(|e| format!("DB error: {}", e))?;

    if all_worktrees.len() > 1 {
        writeln!(md, "## Active Worktrees").unwrap();
        writeln!(md).unwrap();
        for wt in &all_worktrees {
            let marker = if wt.id == worktree_id {
                " (current)"
            } else {
                ""
            };
            writeln!(md, "- `{}`{}", wt.branch_name, marker).unwrap();
        }
        writeln!(md).unwrap();
    }

    // Memory sections
    append_memory_sections(&mut md, conn, worktree_id);

    Ok(md)
}

/// Appends memory sections (decisions, dead ends, notes) to the CLAUDE.md content.
fn append_memory_sections(md: &mut String, conn: &Connection, worktree_id: i64) {
    let mut budget = MEMORY_BUDGET;

    // Key Decisions
    if let Ok(decisions) = queries::list_memory_notes(conn, worktree_id, Some("decision")) {
        if !decisions.is_empty() {
            writeln!(md, "## Key Decisions").unwrap();
            writeln!(md).unwrap();
            for note in decisions.iter().take(10) {
                let truncated = truncate_content(&note.content, 200);
                let line = format!("- **{}**: {}\n", note.created_at, truncated);
                if line.len() > budget {
                    break;
                }
                budget -= line.len();
                write!(md, "{}", line).unwrap();
            }
            writeln!(md).unwrap();
        }
    }

    // Dead Ends
    if let Ok(dead_ends) = queries::list_memory_notes(conn, worktree_id, Some("dead_end")) {
        if !dead_ends.is_empty() {
            writeln!(md, "## Dead Ends (Do Not Retry)").unwrap();
            writeln!(md).unwrap();
            for note in dead_ends.iter().take(10) {
                let de = DeadEnd::from_content(&note.content);
                let line = format!(
                    "- **{}**: {} — {}\n",
                    note.created_at, de.approach, de.failure_reason
                );
                if line.len() > budget {
                    break;
                }
                budget -= line.len();
                write!(md, "{}", line).unwrap();
            }
            writeln!(md).unwrap();
        }
    }

    // Session Notes (recent general notes)
    if let Ok(notes) = queries::list_memory_notes(conn, worktree_id, Some("note")) {
        if !notes.is_empty() {
            writeln!(md, "## Session Notes").unwrap();
            writeln!(md).unwrap();
            for note in notes.iter().take(10) {
                let truncated = truncate_content(&note.content, 200);
                let line = format!("- {}\n", truncated);
                if line.len() > budget {
                    break;
                }
                budget -= line.len();
                write!(md, "{}", line).unwrap();
            }
            writeln!(md).unwrap();
        }
    }
}

fn truncate_content(content: &str, max_len: usize) -> &str {
    if content.len() <= max_len {
        content
    } else {
        // Find a safe truncation point (avoid splitting UTF-8)
        let mut end = max_len;
        while end > 0 && !content.is_char_boundary(end) {
            end -= 1;
        }
        &content[..end]
    }
}

/// Writes the CLAUDE.md content to the worktree root and ensures it's gitignored.
pub fn write_claude_md(conn: &Connection, worktree_id: i64, content: &str) -> Result<(), String> {
    let worktree = queries::get_worktree(conn, worktree_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Worktree not found")?;

    let dir = Path::new(&worktree.path);
    if !dir.exists() {
        return Err("Worktree directory does not exist".into());
    }

    let claude_path = dir.join("CLAUDE.md");
    std::fs::write(&claude_path, content)
        .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    // Ensure CLAUDE.md is gitignored
    let gitignore = dir.join(".gitignore");
    if gitignore.exists() {
        let gi_content =
            std::fs::read_to_string(&gitignore).map_err(|e| format!("Read error: {}", e))?;
        if !gi_content.lines().any(|l| l.trim() == "CLAUDE.md") {
            let separator = if gi_content.ends_with('\n') { "" } else { "\n" };
            std::fs::write(
                &gitignore,
                format!("{}{}CLAUDE.md\n", gi_content, separator),
            )
            .map_err(|e| format!("Write error: {}", e))?;
        }
    } else {
        std::fs::write(&gitignore, "CLAUDE.md\n").map_err(|e| format!("Write error: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_test_db;

    #[test]
    fn generate_basic_claude_md() {
        let conn = init_test_db();

        let pid =
            queries::insert_project(&conn, "my-app", "/tmp/my-app", None, Some("react")).unwrap();
        let wid = queries::insert_worktree(&conn, pid, "main", "/tmp/my-app").unwrap();

        let content = generate_claude_md(&conn, wid).unwrap();

        assert!(content.contains("Managed by Workroot"));
        assert!(content.contains("# my-app"));
        assert!(content.contains("**Path**: `/tmp/my-app`"));
        assert!(content.contains("**Framework**: react"));
        assert!(content.contains("**Branch**: `main`"));
    }

    #[test]
    fn generate_with_env_vars() {
        let conn = init_test_db();

        let pid = queries::insert_project(&conn, "app", "/tmp/app", None, None).unwrap();
        let wid = queries::insert_worktree(&conn, pid, "dev", "/tmp/app-dev").unwrap();

        let profile_id = queries::insert_env_profile(&conn, pid, "development").unwrap();
        queries::insert_env_var(&conn, profile_id, "DATABASE_URL", Some("enc")).unwrap();
        queries::insert_env_var(&conn, profile_id, "API_KEY", Some("enc")).unwrap();

        let content = generate_claude_md(&conn, wid).unwrap();

        assert!(content.contains("Environment Variables"));
        assert!(content.contains("`DATABASE_URL`"));
        assert!(content.contains("`API_KEY`"));
        // Should NOT contain actual values
        assert!(!content.contains("enc"));
    }

    #[test]
    fn generate_with_running_process() {
        let conn = init_test_db();

        let pid = queries::insert_project(&conn, "app", "/tmp/app", None, None).unwrap();
        let wid = queries::insert_worktree(&conn, pid, "main", "/tmp/app").unwrap();

        let proc_id = queries::insert_process(&conn, wid, "npm run dev").unwrap();
        queries::update_process_started(&conn, proc_id, Some(12345), 3001).unwrap();

        let content = generate_claude_md(&conn, wid).unwrap();

        assert!(content.contains("Dev Server"));
        assert!(content.contains("Running"));
        assert!(content.contains("`npm run dev`"));
        assert!(content.contains("3001"));
    }

    #[test]
    fn generate_with_multiple_worktrees() {
        let conn = init_test_db();

        let pid = queries::insert_project(&conn, "app", "/tmp/app", None, None).unwrap();
        let wid1 = queries::insert_worktree(&conn, pid, "main", "/tmp/app").unwrap();
        queries::insert_worktree(&conn, pid, "feature-x", "/tmp/app-x").unwrap();

        let content = generate_claude_md(&conn, wid1).unwrap();

        assert!(content.contains("Active Worktrees"));
        assert!(content.contains("`main` (current)"));
        assert!(content.contains("`feature-x`"));
    }

    #[test]
    fn generate_with_memory_notes() {
        let conn = init_test_db();

        let pid = queries::insert_project(&conn, "app", "/tmp/app", None, None).unwrap();
        let wid = queries::insert_worktree(&conn, pid, "main", "/tmp/app").unwrap();

        queries::insert_memory_note(&conn, wid, "Use PostgreSQL for persistence", "decision")
            .unwrap();
        queries::insert_memory_note(&conn, wid, "Remember to check edge cases", "note").unwrap();

        // Add a dead end as JSON
        let de = serde_json::json!({
            "approach": "SQLite for production",
            "failure_reason": "Cannot handle concurrent writes",
            "error_message": null
        });
        queries::insert_memory_note(&conn, wid, &de.to_string(), "dead_end").unwrap();

        let content = generate_claude_md(&conn, wid).unwrap();

        assert!(content.contains("Key Decisions"));
        assert!(content.contains("Use PostgreSQL"));
        assert!(content.contains("Dead Ends"));
        assert!(content.contains("SQLite for production"));
        assert!(content.contains("Session Notes"));
        assert!(content.contains("edge cases"));
    }
}
