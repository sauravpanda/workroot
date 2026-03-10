-- Workroot Core Schema
-- All statements use IF NOT EXISTS for idempotent migrations.

-- Drop renamed tables from PR-001 (no production data exists yet)
DROP TABLE IF EXISTS log_entries;
DROP TABLE IF EXISTS shell_commands;
DROP TABLE IF EXISTS memory_items;
DROP TABLE IF EXISTS http_requests;
DROP TABLE IF EXISTS network_traffic;

-- ============================================================
-- Core Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    github_url  TEXT,
    local_path  TEXT NOT NULL,
    framework   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS worktrees (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    branch_name TEXT NOT NULL,
    path        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    port        INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS env_profiles (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS env_vars (
    id              INTEGER PRIMARY KEY,
    profile_id      INTEGER NOT NULL REFERENCES env_profiles(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,
    encrypted_value TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS processes (
    id          INTEGER PRIMARY KEY,
    worktree_id INTEGER NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
    pid         INTEGER,
    command     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'stopped',
    port        INTEGER,
    started_at  TEXT,
    stopped_at  TEXT
);

CREATE TABLE IF NOT EXISTS logs (
    id          INTEGER PRIMARY KEY,
    process_id  INTEGER NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    stream      TEXT NOT NULL CHECK(stream IN ('stdout', 'stderr')),
    content     TEXT NOT NULL,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shell_history (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    branch      TEXT,
    command     TEXT NOT NULL,
    exit_code   INTEGER,
    cwd         TEXT,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memory_notes (
    id          INTEGER PRIMARY KEY,
    worktree_id INTEGER NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    embedding   BLOB,
    category    TEXT NOT NULL CHECK(category IN ('note', 'dead_end', 'decision')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS file_events (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_path   TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS network_traffic (
    id                INTEGER PRIMARY KEY,
    process_id        INTEGER REFERENCES processes(id) ON DELETE CASCADE,
    method            TEXT NOT NULL,
    url               TEXT NOT NULL,
    status_code       INTEGER,
    request_headers   TEXT,
    request_body      TEXT,
    response_headers  TEXT,
    response_body     TEXT,
    duration_ms       INTEGER,
    timestamp         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS browser_events (
    id          INTEGER PRIMARY KEY,
    event_type  TEXT NOT NULL,
    message     TEXT NOT NULL,
    url         TEXT,
    status_code INTEGER,
    details     TEXT,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS command_bookmarks (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    command     TEXT NOT NULL,
    tags        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_worktrees_project_id ON worktrees(project_id);
CREATE INDEX IF NOT EXISTS idx_env_profiles_project_id ON env_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_env_vars_profile_id ON env_vars(profile_id);
CREATE INDEX IF NOT EXISTS idx_processes_worktree_id ON processes(worktree_id);
CREATE INDEX IF NOT EXISTS idx_logs_process_id ON logs(process_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_shell_history_project_id ON shell_history(project_id);
CREATE INDEX IF NOT EXISTS idx_shell_history_timestamp ON shell_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_memory_notes_worktree_id ON memory_notes(worktree_id);
CREATE INDEX IF NOT EXISTS idx_file_events_project_id ON file_events(project_id);
CREATE INDEX IF NOT EXISTS idx_file_events_timestamp ON file_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_network_traffic_process_id ON network_traffic(process_id);
CREATE INDEX IF NOT EXISTS idx_network_traffic_timestamp ON network_traffic(timestamp);
CREATE INDEX IF NOT EXISTS idx_browser_events_timestamp ON browser_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_browser_events_type ON browser_events(event_type);
CREATE INDEX IF NOT EXISTS idx_command_bookmarks_project_id ON command_bookmarks(project_id);

-- ============================================================
-- Task Runs (PR-069)
-- ============================================================

CREATE TABLE IF NOT EXISTS task_runs (
    id          INTEGER PRIMARY KEY,
    task_name   TEXT NOT NULL,
    cwd         TEXT NOT NULL,
    exit_code   INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    output_preview TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_runs_lookup ON task_runs(cwd, task_name);

-- ============================================================
-- Ring Buffer Trigger: keep at most 50,000 log rows per process
-- ============================================================

CREATE TRIGGER IF NOT EXISTS logs_ring_buffer
AFTER INSERT ON logs
WHEN (SELECT COUNT(*) FROM logs WHERE process_id = NEW.process_id) > 50000
BEGIN
    DELETE FROM logs
    WHERE id IN (
        SELECT id FROM logs
        WHERE process_id = NEW.process_id
        ORDER BY id ASC
        LIMIT (SELECT COUNT(*) - 50000 FROM logs WHERE process_id = NEW.process_id)
    );
END;
