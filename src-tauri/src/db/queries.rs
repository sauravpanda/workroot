use rusqlite::{params, Connection};
use serde::Serialize;

// ============================================================
// Row structs
// ============================================================

#[derive(Debug, Serialize)]
pub struct ProjectRow {
    pub id: i64,
    pub name: String,
    pub github_url: Option<String>,
    pub local_path: String,
    pub framework: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct WorktreeRow {
    pub id: i64,
    pub project_id: i64,
    pub branch_name: String,
    pub path: String,
    pub status: String,
    pub port: Option<i64>,
    pub created_at: String,
    pub deleted_at: Option<String>,
    pub hidden_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct EnvProfileRow {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct EnvVarRow {
    pub id: i64,
    pub profile_id: i64,
    pub key: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ProcessRow {
    pub id: i64,
    pub worktree_id: i64,
    pub pid: Option<i64>,
    pub command: String,
    pub status: String,
    pub port: Option<i64>,
    pub started_at: Option<String>,
    pub stopped_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LogRow {
    pub id: i64,
    pub process_id: i64,
    pub stream: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize)]
pub struct ShellHistoryRow {
    pub id: i64,
    pub project_id: i64,
    pub branch: Option<String>,
    pub command: String,
    pub exit_code: Option<i64>,
    pub cwd: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Serialize)]
pub struct MemoryNoteRow {
    pub id: i64,
    pub worktree_id: i64,
    pub content: String,
    pub category: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct FileEventRow {
    pub id: i64,
    pub project_id: i64,
    pub file_path: String,
    pub event_type: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize)]
pub struct NetworkTrafficRow {
    pub id: i64,
    pub process_id: i64,
    pub method: String,
    pub url: String,
    pub status_code: Option<i64>,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub timestamp: String,
}

// ============================================================
// Projects
// ============================================================

pub fn insert_project(
    conn: &Connection,
    name: &str,
    local_path: &str,
    github_url: Option<&str>,
    framework: Option<&str>,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO projects (name, local_path, github_url, framework) VALUES (?1, ?2, ?3, ?4)",
        params![name, local_path, github_url, framework],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_project(conn: &Connection, id: i64) -> Result<Option<ProjectRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, github_url, local_path, framework, created_at, updated_at
         FROM projects WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(ProjectRow {
            id: row.get(0)?,
            name: row.get(1)?,
            github_url: row.get(2)?,
            local_path: row.get(3)?,
            framework: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list_projects(conn: &Connection) -> Result<Vec<ProjectRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, github_url, local_path, framework, created_at, updated_at
         FROM projects ORDER BY created_at DESC LIMIT 500",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ProjectRow {
            id: row.get(0)?,
            name: row.get(1)?,
            github_url: row.get(2)?,
            local_path: row.get(3)?,
            framework: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn delete_project(conn: &Connection, id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

// ============================================================
// Worktrees
// ============================================================

pub fn insert_worktree(
    conn: &Connection,
    project_id: i64,
    branch_name: &str,
    path: &str,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO worktrees (project_id, branch_name, path) VALUES (?1, ?2, ?3)",
        params![project_id, branch_name, path],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_worktree(conn: &Connection, id: i64) -> Result<Option<WorktreeRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, branch_name, path, status, port, created_at, deleted_at, hidden_at
         FROM worktrees WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(WorktreeRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            branch_name: row.get(2)?,
            path: row.get(3)?,
            status: row.get(4)?,
            port: row.get(5)?,
            created_at: row.get(6)?,
            deleted_at: row.get(7)?,
            hidden_at: row.get(8)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

/// Returns only active (non-archived, non-hidden) worktrees for a project.
pub fn list_worktrees(
    conn: &Connection,
    project_id: i64,
) -> Result<Vec<WorktreeRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, branch_name, path, status, port, created_at, deleted_at, hidden_at
         FROM worktrees WHERE project_id = ?1 AND deleted_at IS NULL AND hidden_at IS NULL ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(WorktreeRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            branch_name: row.get(2)?,
            path: row.get(3)?,
            status: row.get(4)?,
            port: row.get(5)?,
            created_at: row.get(6)?,
            deleted_at: row.get(7)?,
            hidden_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

/// Returns all worktrees for a project, including archived ones, ordered newest first.
pub fn list_all_worktrees(
    conn: &Connection,
    project_id: i64,
) -> Result<Vec<WorktreeRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, branch_name, path, status, port, created_at, deleted_at, hidden_at
         FROM worktrees WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(WorktreeRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            branch_name: row.get(2)?,
            path: row.get(3)?,
            status: row.get(4)?,
            port: row.get(5)?,
            created_at: row.get(6)?,
            deleted_at: row.get(7)?,
            hidden_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

/// Returns only hidden (non-archived) worktrees for a project.
pub fn list_hidden_worktrees(
    conn: &Connection,
    project_id: i64,
) -> Result<Vec<WorktreeRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, branch_name, path, status, port, created_at, deleted_at, hidden_at
         FROM worktrees WHERE project_id = ?1 AND deleted_at IS NULL AND hidden_at IS NOT NULL ORDER BY hidden_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(WorktreeRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            branch_name: row.get(2)?,
            path: row.get(3)?,
            status: row.get(4)?,
            port: row.get(5)?,
            created_at: row.get(6)?,
            deleted_at: row.get(7)?,
            hidden_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

/// Hides a worktree from the sidebar without archiving or deleting it.
pub fn hide_worktree(conn: &Connection, id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute(
        "UPDATE worktrees SET hidden_at = datetime('now') WHERE id = ?1 AND deleted_at IS NULL AND hidden_at IS NULL",
        params![id],
    )?;
    Ok(affected > 0)
}

/// Unhides a previously hidden worktree, making it visible in the sidebar again.
pub fn unhide_worktree(conn: &Connection, id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute(
        "UPDATE worktrees SET hidden_at = NULL WHERE id = ?1 AND hidden_at IS NOT NULL",
        params![id],
    )?;
    Ok(affected > 0)
}

/// Soft-deletes a worktree by recording the deletion timestamp and marking it archived.
/// The filesystem and git worktree are left untouched.
pub fn archive_worktree(conn: &Connection, id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute(
        "UPDATE worktrees SET status = 'archived', deleted_at = datetime('now') WHERE id = ?1 AND deleted_at IS NULL",
        params![id],
    )?;
    Ok(affected > 0)
}

// ============================================================
// Processes
// ============================================================

pub fn insert_process(
    conn: &Connection,
    worktree_id: i64,
    command: &str,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO processes (worktree_id, command) VALUES (?1, ?2)",
        params![worktree_id, command],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_process(conn: &Connection, id: i64) -> Result<Option<ProcessRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, worktree_id, pid, command, status, port, started_at, stopped_at
         FROM processes WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(ProcessRow {
            id: row.get(0)?,
            worktree_id: row.get(1)?,
            pid: row.get(2)?,
            command: row.get(3)?,
            status: row.get(4)?,
            port: row.get(5)?,
            started_at: row.get(6)?,
            stopped_at: row.get(7)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn update_process_started(
    conn: &Connection,
    id: i64,
    pid: Option<i64>,
    port: i64,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE processes SET pid = ?1, port = ?2, status = 'running', started_at = datetime('now')
         WHERE id = ?3",
        params![pid, port, id],
    )?;
    Ok(())
}

pub fn update_process_stopped(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE processes SET status = 'stopped', stopped_at = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn update_process_status(
    conn: &Connection,
    id: i64,
    status: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE processes SET status = ?1 WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}

pub fn update_process_pid(conn: &Connection, id: i64, pid: i64) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE processes SET pid = ?1 WHERE id = ?2",
        params![pid, id],
    )?;
    Ok(())
}

pub fn list_processes(
    conn: &Connection,
    worktree_id: i64,
) -> Result<Vec<ProcessRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, worktree_id, pid, command, status, port, started_at, stopped_at
         FROM processes WHERE worktree_id = ?1",
    )?;
    let rows = stmt.query_map(params![worktree_id], |row| {
        Ok(ProcessRow {
            id: row.get(0)?,
            worktree_id: row.get(1)?,
            pid: row.get(2)?,
            command: row.get(3)?,
            status: row.get(4)?,
            port: row.get(5)?,
            started_at: row.get(6)?,
            stopped_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

// ============================================================
// Logs
// ============================================================

pub fn insert_log(
    conn: &Connection,
    process_id: i64,
    stream: &str,
    content: &str,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO logs (process_id, stream, content) VALUES (?1, ?2, ?3)",
        params![process_id, stream, content],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_logs(
    conn: &Connection,
    process_id: i64,
    limit: i64,
) -> Result<Vec<LogRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, process_id, stream, content, timestamp
         FROM logs WHERE process_id = ?1 ORDER BY id DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![process_id, limit], |row| {
        Ok(LogRow {
            id: row.get(0)?,
            process_id: row.get(1)?,
            stream: row.get(2)?,
            content: row.get(3)?,
            timestamp: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn search_logs(
    conn: &Connection,
    process_id: i64,
    query: &str,
) -> Result<Vec<LogRow>, rusqlite::Error> {
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, process_id, stream, content, timestamp
         FROM logs WHERE process_id = ?1 AND content LIKE ?2 ORDER BY id ASC",
    )?;
    let rows = stmt.query_map(params![process_id, pattern], |row| {
        Ok(LogRow {
            id: row.get(0)?,
            process_id: row.get(1)?,
            stream: row.get(2)?,
            content: row.get(3)?,
            timestamp: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn clear_logs(conn: &Connection, process_id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute(
        "DELETE FROM logs WHERE process_id = ?1",
        params![process_id],
    )?;
    Ok(affected > 0)
}

// ============================================================
// Shell History
// ============================================================

pub fn insert_shell_history(
    conn: &Connection,
    project_id: i64,
    command: &str,
    exit_code: Option<i64>,
    branch: Option<&str>,
    cwd: Option<&str>,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO shell_history (project_id, command, exit_code, branch, cwd)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, command, exit_code, branch, cwd],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_shell_history(
    conn: &Connection,
    project_id: i64,
    branch: Option<&str>,
    limit: i64,
) -> Result<Vec<ShellHistoryRow>, rusqlite::Error> {
    if let Some(branch) = branch {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, branch, command, exit_code, cwd, timestamp
             FROM shell_history WHERE project_id = ?1 AND branch = ?2
             ORDER BY id DESC LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![project_id, branch, limit], |row| {
            Ok(ShellHistoryRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                branch: row.get(2)?,
                command: row.get(3)?,
                exit_code: row.get(4)?,
                cwd: row.get(5)?,
                timestamp: row.get(6)?,
            })
        })?;
        rows.collect()
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, branch, command, exit_code, cwd, timestamp
             FROM shell_history WHERE project_id = ?1
             ORDER BY id DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![project_id, limit], |row| {
            Ok(ShellHistoryRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                branch: row.get(2)?,
                command: row.get(3)?,
                exit_code: row.get(4)?,
                cwd: row.get(5)?,
                timestamp: row.get(6)?,
            })
        })?;
        rows.collect()
    }
}

pub fn search_shell_history(
    conn: &Connection,
    project_id: i64,
    query: &str,
    limit: i64,
) -> Result<Vec<ShellHistoryRow>, rusqlite::Error> {
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, project_id, branch, command, exit_code, cwd, timestamp
         FROM shell_history WHERE project_id = ?1 AND command LIKE ?2
         ORDER BY id DESC LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![project_id, pattern, limit], |row| {
        Ok(ShellHistoryRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            branch: row.get(2)?,
            command: row.get(3)?,
            exit_code: row.get(4)?,
            cwd: row.get(5)?,
            timestamp: row.get(6)?,
        })
    })?;
    rows.collect()
}

// ============================================================
// Memory Notes
// ============================================================

pub fn insert_memory_note(
    conn: &Connection,
    worktree_id: i64,
    content: &str,
    category: &str,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO memory_notes (worktree_id, content, category) VALUES (?1, ?2, ?3)",
        params![worktree_id, content, category],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_memory_note_embedding(
    conn: &Connection,
    id: i64,
    embedding: &[u8],
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE memory_notes SET embedding = ?1 WHERE id = ?2",
        params![embedding, id],
    )?;
    Ok(())
}

pub fn update_memory_note_content(
    conn: &Connection,
    id: i64,
    content: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE memory_notes SET content = ?1 WHERE id = ?2",
        params![content, id],
    )?;
    Ok(())
}

pub fn delete_memory_note(conn: &Connection, id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute("DELETE FROM memory_notes WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

pub fn list_memory_notes(
    conn: &Connection,
    worktree_id: i64,
    category: Option<&str>,
) -> Result<Vec<MemoryNoteRow>, rusqlite::Error> {
    if let Some(cat) = category {
        let mut stmt = conn.prepare(
            "SELECT id, worktree_id, content, category, created_at
             FROM memory_notes WHERE worktree_id = ?1 AND category = ?2
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![worktree_id, cat], |row| {
            Ok(MemoryNoteRow {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                content: row.get(2)?,
                category: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect()
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, worktree_id, content, category, created_at
             FROM memory_notes WHERE worktree_id = ?1
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![worktree_id], |row| {
            Ok(MemoryNoteRow {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                content: row.get(2)?,
                category: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }
}

/// Memory note with its raw embedding blob.
pub type MemoryNoteWithEmbedding = (MemoryNoteRow, Option<Vec<u8>>);

pub fn list_memory_notes_with_embeddings(
    conn: &Connection,
    worktree_id: i64,
) -> Result<Vec<MemoryNoteWithEmbedding>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, worktree_id, content, category, created_at, embedding
         FROM memory_notes WHERE worktree_id = ?1
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![worktree_id], |row| {
        let note = MemoryNoteRow {
            id: row.get(0)?,
            worktree_id: row.get(1)?,
            content: row.get(2)?,
            category: row.get(3)?,
            created_at: row.get(4)?,
        };
        let embedding: Option<Vec<u8>> = row.get(5)?;
        Ok((note, embedding))
    })?;
    rows.collect()
}

// ============================================================
// Network Traffic
// ============================================================

pub fn insert_network_traffic(
    conn: &Connection,
    process_id: i64,
    method: &str,
    url: &str,
    status_code: Option<i64>,
    request_body: Option<&str>,
    response_body: Option<&str>,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO network_traffic (process_id, method, url, status_code, request_body, response_body)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![process_id, method, url, status_code, request_body, response_body],
    )?;
    Ok(conn.last_insert_rowid())
}

// ============================================================
// Env Profiles
// ============================================================

pub fn insert_env_profile(
    conn: &Connection,
    project_id: i64,
    name: &str,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO env_profiles (project_id, name) VALUES (?1, ?2)",
        params![project_id, name],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_env_profiles(
    conn: &Connection,
    project_id: i64,
) -> Result<Vec<EnvProfileRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, is_active, created_at
         FROM env_profiles WHERE project_id = ?1 ORDER BY name",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(EnvProfileRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            is_active: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn delete_env_profile(conn: &Connection, id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute("DELETE FROM env_profiles WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

pub fn list_env_profiles_all(conn: &Connection) -> Result<Vec<EnvProfileRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, is_active, created_at
         FROM env_profiles ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(EnvProfileRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            is_active: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

// ============================================================
// Env Vars
// ============================================================

pub fn insert_env_var(
    conn: &Connection,
    profile_id: i64,
    key: &str,
    encrypted_value: Option<&str>,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO env_vars (profile_id, key, encrypted_value) VALUES (?1, ?2, ?3)",
        params![profile_id, key, encrypted_value],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_env_var_keys(
    conn: &Connection,
    profile_id: i64,
) -> Result<Vec<EnvVarRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, profile_id, key, created_at
         FROM env_vars WHERE profile_id = ?1 ORDER BY key",
    )?;
    let rows = stmt.query_map(params![profile_id], |row| {
        Ok(EnvVarRow {
            id: row.get(0)?,
            profile_id: row.get(1)?,
            key: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

#[derive(Debug, Serialize)]
pub struct EnvVarFullRow {
    pub id: i64,
    pub profile_id: i64,
    pub key: String,
    pub encrypted_value: Option<String>,
    pub created_at: String,
}

pub fn list_env_vars_with_values(
    conn: &Connection,
    profile_id: i64,
) -> Result<Vec<EnvVarFullRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, profile_id, key, encrypted_value, created_at
         FROM env_vars WHERE profile_id = ?1 ORDER BY key",
    )?;
    let rows = stmt.query_map(params![profile_id], |row| {
        Ok(EnvVarFullRow {
            id: row.get(0)?,
            profile_id: row.get(1)?,
            key: row.get(2)?,
            encrypted_value: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn delete_env_var(conn: &Connection, id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute("DELETE FROM env_vars WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

pub fn update_env_var(
    conn: &Connection,
    id: i64,
    key: &str,
    encrypted_value: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE env_vars SET key = ?1, encrypted_value = ?2 WHERE id = ?3",
        params![key, encrypted_value, id],
    )?;
    Ok(())
}

// ============================================================
// Command Bookmarks
// ============================================================

#[derive(Debug, Serialize)]
pub struct BookmarkRow {
    pub id: i64,
    pub project_id: Option<i64>,
    pub label: String,
    pub command: String,
    pub tags: String,
    pub created_at: String,
}

pub fn insert_bookmark(
    conn: &Connection,
    project_id: Option<i64>,
    label: &str,
    command: &str,
    tags: &str,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO command_bookmarks (project_id, label, command, tags) VALUES (?1, ?2, ?3, ?4)",
        params![project_id, label, command, tags],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_bookmarks(
    conn: &Connection,
    project_id: Option<i64>,
) -> Result<Vec<BookmarkRow>, rusqlite::Error> {
    // Return global bookmarks (project_id IS NULL) plus project-scoped ones
    if let Some(pid) = project_id {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, label, command, tags, created_at
             FROM command_bookmarks
             WHERE project_id IS NULL OR project_id = ?1
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![pid], |row| {
            Ok(BookmarkRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                label: row.get(2)?,
                command: row.get(3)?,
                tags: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, label, command, tags, created_at
             FROM command_bookmarks
             WHERE project_id IS NULL
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(BookmarkRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                label: row.get(2)?,
                command: row.get(3)?,
                tags: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }
}

pub fn update_bookmark(
    conn: &Connection,
    id: i64,
    label: &str,
    command: &str,
    tags: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE command_bookmarks SET label = ?1, command = ?2, tags = ?3 WHERE id = ?4",
        params![label, command, tags, id],
    )?;
    Ok(())
}

pub fn delete_bookmark(conn: &Connection, id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute("DELETE FROM command_bookmarks WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

#[cfg(test)]
mod tests {
    use super::super::init_test_db;
    use super::*;

    #[test]
    fn project_crud() {
        let conn = init_test_db();

        let id = insert_project(&conn, "my-app", "/home/user/my-app", None, Some("react")).unwrap();
        assert!(id > 0);

        let project = get_project(&conn, id).unwrap().unwrap();
        assert_eq!(project.name, "my-app");
        assert_eq!(project.local_path, "/home/user/my-app");
        assert_eq!(project.framework.as_deref(), Some("react"));
        assert!(project.github_url.is_none());

        let projects = list_projects(&conn).unwrap();
        assert_eq!(projects.len(), 1);

        let deleted = delete_project(&conn, id).unwrap();
        assert!(deleted);

        let gone = get_project(&conn, id).unwrap();
        assert!(gone.is_none());
    }

    #[test]
    fn worktree_crud() {
        let conn = init_test_db();
        let pid = insert_project(&conn, "test", "/tmp/test", None, None).unwrap();

        let wid = insert_worktree(&conn, pid, "feature-branch", "/tmp/test-feature").unwrap();
        assert!(wid > 0);

        let trees = list_worktrees(&conn, pid).unwrap();
        assert_eq!(trees.len(), 1);
        assert_eq!(trees[0].branch_name, "feature-branch");
        assert_eq!(trees[0].status, "active");

        let archived = archive_worktree(&conn, wid).unwrap();
        assert!(archived);
        // Active list should be empty after archive
        assert!(list_worktrees(&conn, pid).unwrap().is_empty());
        // History should still contain the archived worktree
        let history = list_all_worktrees(&conn, pid).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].status, "archived");
        assert!(history[0].deleted_at.is_some());
    }

    #[test]
    fn cascade_delete_project_removes_worktrees() {
        let conn = init_test_db();
        let pid = insert_project(&conn, "test", "/tmp", None, None).unwrap();
        insert_worktree(&conn, pid, "main", "/tmp/main").unwrap();
        insert_worktree(&conn, pid, "dev", "/tmp/dev").unwrap();

        delete_project(&conn, pid).unwrap();
        assert!(list_worktrees(&conn, pid).unwrap().is_empty());
    }

    #[test]
    fn log_insert_and_query() {
        let conn = init_test_db();
        let pid = insert_project(&conn, "test", "/tmp", None, None).unwrap();
        let wid = insert_worktree(&conn, pid, "main", "/tmp").unwrap();
        let proc_id = insert_process(&conn, wid, "npm start").unwrap();

        insert_log(&conn, proc_id, "stdout", "Server started").unwrap();
        insert_log(&conn, proc_id, "stderr", "Warning: deprecated").unwrap();

        let logs = get_logs(&conn, proc_id, 10).unwrap();
        assert_eq!(logs.len(), 2);
        // DESC order — most recent first
        assert_eq!(logs[0].content, "Warning: deprecated");
        assert_eq!(logs[0].stream, "stderr");
    }

    #[test]
    fn env_profile_and_vars() {
        let conn = init_test_db();
        let pid = insert_project(&conn, "test", "/tmp", None, None).unwrap();

        let profile_id = insert_env_profile(&conn, pid, "development").unwrap();
        insert_env_var(&conn, profile_id, "DATABASE_URL", Some("encrypted:abc")).unwrap();
        insert_env_var(&conn, profile_id, "API_KEY", Some("encrypted:xyz")).unwrap();

        let profiles = list_env_profiles(&conn, pid).unwrap();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].name, "development");

        let keys = list_env_var_keys(&conn, profile_id).unwrap();
        assert_eq!(keys.len(), 2);
        // Ordered by key
        assert_eq!(keys[0].key, "API_KEY");
        assert_eq!(keys[1].key, "DATABASE_URL");
    }

    #[test]
    fn log_search_and_clear() {
        let conn = init_test_db();
        let pid = insert_project(&conn, "test", "/tmp", None, None).unwrap();
        let wid = insert_worktree(&conn, pid, "main", "/tmp").unwrap();
        let proc_id = insert_process(&conn, wid, "npm start").unwrap();

        insert_log(&conn, proc_id, "stdout", "Server started on port 3000").unwrap();
        insert_log(&conn, proc_id, "stdout", "Compiling...").unwrap();
        insert_log(&conn, proc_id, "stderr", "Warning: deprecated API").unwrap();
        insert_log(&conn, proc_id, "stdout", "Ready on port 3000").unwrap();

        // Search for "port"
        let results = search_logs(&conn, proc_id, "port").unwrap();
        assert_eq!(results.len(), 2);
        assert!(results[0].content.contains("port"));
        assert!(results[1].content.contains("port"));

        // Search for "Warning"
        let results = search_logs(&conn, proc_id, "Warning").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].stream, "stderr");

        // Clear logs
        let cleared = clear_logs(&conn, proc_id).unwrap();
        assert!(cleared);

        let logs = get_logs(&conn, proc_id, 100).unwrap();
        assert!(logs.is_empty());
    }

    #[test]
    fn memory_note_category_check() {
        let conn = init_test_db();
        let pid = insert_project(&conn, "test", "/tmp", None, None).unwrap();
        let wid = insert_worktree(&conn, pid, "main", "/tmp").unwrap();

        // Valid categories
        insert_memory_note(&conn, wid, "Remember this", "note").unwrap();
        insert_memory_note(&conn, wid, "Don't try X", "dead_end").unwrap();
        insert_memory_note(&conn, wid, "Use approach Y", "decision").unwrap();

        // Invalid category should fail
        let result = insert_memory_note(&conn, wid, "bad", "invalid_category");
        assert!(result.is_err());
    }

    #[test]
    fn bookmark_crud() {
        let conn = init_test_db();
        let pid = insert_project(&conn, "test", "/tmp/test", None, None).unwrap();

        // Insert global bookmark
        let b1 = insert_bookmark(&conn, None, "List files", "ls -la", "fs,util").unwrap();
        assert!(b1 > 0);

        // Insert project-scoped bookmark
        let b2 = insert_bookmark(&conn, Some(pid), "Run tests", "npm test", "test,npm").unwrap();
        assert!(b2 > 0);

        // List with project context: should see both global + project-scoped
        let all = list_bookmarks(&conn, Some(pid)).unwrap();
        assert_eq!(all.len(), 2);

        // List without project: only global
        let global = list_bookmarks(&conn, None).unwrap();
        assert_eq!(global.len(), 1);
        assert_eq!(global[0].label, "List files");

        // Update
        update_bookmark(&conn, b1, "List all files", "ls -lah", "fs,util").unwrap();
        let updated = list_bookmarks(&conn, None).unwrap();
        assert_eq!(updated[0].label, "List all files");
        assert_eq!(updated[0].command, "ls -lah");

        // Delete
        let deleted = delete_bookmark(&conn, b1).unwrap();
        assert!(deleted);
        let remaining = list_bookmarks(&conn, Some(pid)).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].label, "Run tests");
    }

    #[test]
    fn shell_history_query_and_search() {
        let conn = init_test_db();
        let pid = insert_project(&conn, "test", "/tmp/test", None, None).unwrap();

        insert_shell_history(
            &conn,
            pid,
            "npm install",
            Some(0),
            Some("main"),
            Some("/tmp/test"),
        )
        .unwrap();
        insert_shell_history(
            &conn,
            pid,
            "npm run build",
            Some(1),
            Some("main"),
            Some("/tmp/test"),
        )
        .unwrap();
        insert_shell_history(
            &conn,
            pid,
            "git status",
            Some(0),
            Some("feature"),
            Some("/tmp/test"),
        )
        .unwrap();

        // Get all history for project
        let all = get_shell_history(&conn, pid, None, 100).unwrap();
        assert_eq!(all.len(), 3);

        // Filter by branch
        let main_only = get_shell_history(&conn, pid, Some("main"), 100).unwrap();
        assert_eq!(main_only.len(), 2);

        // Search
        let results = search_shell_history(&conn, pid, "npm", 100).unwrap();
        assert_eq!(results.len(), 2);

        let results = search_shell_history(&conn, pid, "git", 100).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].command, "git status");
    }
}
