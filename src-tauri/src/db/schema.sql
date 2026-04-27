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
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at  TEXT
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
-- Benchmarks (PR-xxx)
-- ============================================================

CREATE TABLE IF NOT EXISTS benchmarks (
    id          INTEGER PRIMARY KEY,
    cwd         TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value       REAL NOT NULL,
    unit        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_benchmarks_lookup ON benchmarks(cwd, metric_name);

-- ============================================================
-- Test Results / Flaky Detection (PR-xxx)
-- ============================================================

CREATE TABLE IF NOT EXISTS test_results (
    id          INTEGER PRIMARY KEY,
    cwd         TEXT NOT NULL,
    test_name   TEXT NOT NULL,
    status      TEXT NOT NULL,
    duration_ms INTEGER,
    run_id      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_test_results_lookup ON test_results(cwd, test_name);

-- ============================================================
-- Activity Timeline (PR-xxx)
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_events (
    id          INTEGER PRIMARY KEY,
    event_type  TEXT NOT NULL,
    title       TEXT NOT NULL,
    detail      TEXT,
    project_id  INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_events_created ON activity_events(created_at);

-- ============================================================
-- AI Chat History
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT 'New Chat',
    project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id          INTEGER PRIMARY KEY,
    session_id  INTEGER NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session ON ai_chat_messages(session_id);

-- ============================================================
-- Ring Buffer Trigger: keep at most 50,000 log rows per process
-- ============================================================

-- Only check every 1000 inserts to amortize the cleanup cost.
-- Uses OFFSET-based cutoff instead of COUNT(*) for efficiency.
CREATE TRIGGER IF NOT EXISTS logs_ring_buffer
AFTER INSERT ON logs
WHEN NEW.id % 1000 = 0
BEGIN
    DELETE FROM logs
    WHERE process_id = NEW.process_id
      AND id < (
          SELECT COALESCE(
              (SELECT id FROM logs
               WHERE process_id = NEW.process_id
               ORDER BY id DESC
               LIMIT 1 OFFSET 50000),
              0
          )
      );
END;

-- ============================================================
-- Terminal Session Recordings
-- ============================================================

CREATE TABLE IF NOT EXISTS terminal_sessions (
    id          INTEGER PRIMARY KEY,
    worktree_id INTEGER NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Recording',
    status      TEXT NOT NULL DEFAULT 'recording',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_worktree ON terminal_sessions(worktree_id);

CREATE TABLE IF NOT EXISTS terminal_events (
    id          INTEGER PRIMARY KEY,
    session_id  INTEGER NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL CHECK(event_type IN ('input', 'output')),
    data        TEXT NOT NULL,
    timestamp_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_terminal_events_session ON terminal_events(session_id);

-- ============================================================
-- DORA Metrics / Deployments
-- ============================================================

CREATE TABLE IF NOT EXISTS deployments (
    id              INTEGER PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version         TEXT NOT NULL,
    environment     TEXT NOT NULL DEFAULT 'production',
    status          TEXT NOT NULL CHECK(status IN ('success', 'failure', 'rollback')),
    lead_time_hours REAL,
    deployed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id, deployed_at);

-- ============================================================
-- Webhook Events
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_events (
    id          INTEGER PRIMARY KEY,
    source      TEXT NOT NULL DEFAULT 'unknown',
    event_type  TEXT NOT NULL DEFAULT 'unknown',
    payload     TEXT NOT NULL DEFAULT '{}',
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events(received_at);

-- ============================================================
-- SSH Connections
-- ============================================================

CREATE TABLE IF NOT EXISTS ssh_connections (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    host        TEXT NOT NULL,
    port        INTEGER NOT NULL DEFAULT 22,
    username    TEXT NOT NULL,
    auth_type   TEXT NOT NULL DEFAULT 'key',
    key_path    TEXT,
    jump_host   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Code Snippets
-- ============================================================

CREATE TABLE IF NOT EXISTS snippets (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    language    TEXT NOT NULL DEFAULT 'text',
    content     TEXT NOT NULL,
    tags        TEXT NOT NULL DEFAULT '',
    project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_snippets_project ON snippets(project_id);

-- ============================================================
-- Web Vitals / Lighthouse
-- ============================================================

CREATE TABLE IF NOT EXISTS web_vitals (
    id                INTEGER PRIMARY KEY,
    url               TEXT NOT NULL,
    performance_score REAL,
    fcp_ms            REAL,
    lcp_ms            REAL,
    cls               REAL,
    tbt_ms            REAL,
    ttfb_ms           REAL,
    speed_index_ms    REAL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_web_vitals_url ON web_vitals(url, created_at);

-- ============================================================
-- Workspace Layouts
-- ============================================================

CREATE TABLE IF NOT EXISTS workspace_layouts (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    config      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Scheduled Tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    command     TEXT NOT NULL,
    cron_expr   TEXT NOT NULL,
    cwd         TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    last_run    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Clipboard History
-- ============================================================

CREATE TABLE IF NOT EXISTS clipboard_history (
    id          INTEGER PRIMARY KEY,
    content     TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT 'manual',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Todos
-- ============================================================

CREATE TABLE IF NOT EXISTS todos (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority    TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    status      TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);

-- ============================================================
-- Checkpoints (Issue #70)
-- ============================================================

CREATE TABLE IF NOT EXISTS checkpoints (
    id          INTEGER PRIMARY KEY,
    worktree_id INTEGER NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    head_sha    TEXT NOT NULL,
    stash_oid   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_worktree_id ON checkpoints(worktree_id);

-- ============================================================
-- Multi-Agent Pipeline (Issue #66)
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_definitions (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('generator', 'reviewer')),
    command     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_definitions (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    generator_id    INTEGER NOT NULL REFERENCES agent_definitions(id) ON DELETE RESTRICT,
    reviewer_id     INTEGER NOT NULL REFERENCES agent_definitions(id) ON DELETE RESTRICT,
    max_iterations  INTEGER NOT NULL DEFAULT 3,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id              INTEGER PRIMARY KEY,
    pipeline_id     INTEGER NOT NULL REFERENCES pipeline_definitions(id) ON DELETE CASCADE,
    worktree_id     INTEGER NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
    task_desc       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'running'
                        CHECK(status IN ('running', 'approved', 'failed', 'max_iterations')),
    iterations      INTEGER NOT NULL DEFAULT 0,
    output          TEXT NOT NULL DEFAULT '[]',
    started_at      TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline ON pipeline_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_worktree ON pipeline_runs(worktree_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started  ON pipeline_runs(started_at);
