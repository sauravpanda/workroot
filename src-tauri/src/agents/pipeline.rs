use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;

#[tauri::command]
pub async fn save_text_file(path: String, contents: String) -> Result<(), String> {
    tokio::fs::write(&path, contents)
        .await
        .map_err(|e| e.to_string())
}

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentDef {
    pub id: i64,
    pub name: String,
    pub role: String,
    pub command: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PipelineDef {
    pub id: i64,
    pub name: String,
    pub generator_id: i64,
    pub reviewer_id: i64,
    pub max_iterations: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PipelineRun {
    pub id: i64,
    pub pipeline_id: i64,
    pub worktree_id: i64,
    pub task_desc: String,
    pub status: String,
    pub iterations: i64,
    pub output: Vec<StepOutput>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StepOutput {
    pub iteration: u32,
    pub role: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct PipelineProgressEvent {
    pub run_id: i64,
    pub iteration: u32,
    pub max_iterations: u32,
    pub phase: String,
    pub status: String,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn is_approved(reviewer_stdout: &str) -> bool {
    let lower = reviewer_stdout.to_lowercase();
    lower.contains("approved")
        || lower.contains("lgtm")
        || lower.contains("looks good")
        || lower.contains("no issues")
        || lower.contains("no changes needed")
        || lower.contains("nothing to change")
        || lower.contains("all good")
}

fn get_git_diff(worktree_path: &str) -> String {
    let output = std::process::Command::new("git")
        .args(["diff", "HEAD"])
        .current_dir(worktree_path)
        .output();
    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).into_owned(),
        Err(_) => String::new(),
    }
}

/// Split a shell command string into argv parts (naive split on whitespace,
/// honouring quoted strings is not required for v1).
fn split_command(cmd: &str) -> Vec<String> {
    cmd.split_whitespace().map(|s| s.to_string()).collect()
}

// ─── Agent CRUD ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_agent(
    db: State<'_, AppDb>,
    name: String,
    role: String,
    command: String,
) -> Result<AgentDef, String> {
    if role != "generator" && role != "reviewer" {
        return Err("role must be 'generator' or 'reviewer'".into());
    }
    let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
    conn.execute(
        "INSERT INTO agent_definitions (name, role, command) VALUES (?1, ?2, ?3)",
        params![name, role, command],
    )
    .map_err(|e| format!("DB error: {e}"))?;
    let id = conn.last_insert_rowid();
    let agent = conn
        .query_row(
            "SELECT id, name, role, command, created_at FROM agent_definitions WHERE id = ?1",
            params![id],
            |row| {
                Ok(AgentDef {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    role: row.get(2)?,
                    command: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| format!("DB error: {e}"))?;
    Ok(agent)
}

#[tauri::command]
pub fn list_agents(db: State<'_, AppDb>) -> Result<Vec<AgentDef>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, role, command, created_at FROM agent_definitions ORDER BY created_at DESC",
        )
        .map_err(|e| format!("DB error: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(AgentDef {
                id: row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
                command: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("DB error: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB error: {e}"))
}

#[tauri::command]
pub fn delete_agent(db: State<'_, AppDb>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
    conn.execute("DELETE FROM agent_definitions WHERE id = ?1", params![id])
        .map_err(|e| format!("DB error: {e}"))?;
    Ok(())
}

// ─── Pipeline CRUD ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_pipeline(
    db: State<'_, AppDb>,
    name: String,
    generator_id: i64,
    reviewer_id: i64,
    max_iterations: i64,
) -> Result<PipelineDef, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
    conn.execute(
        "INSERT INTO pipeline_definitions (name, generator_id, reviewer_id, max_iterations)
         VALUES (?1, ?2, ?3, ?4)",
        params![name, generator_id, reviewer_id, max_iterations],
    )
    .map_err(|e| format!("DB error: {e}"))?;
    let id = conn.last_insert_rowid();
    let p = conn
        .query_row(
            "SELECT id, name, generator_id, reviewer_id, max_iterations, created_at
             FROM pipeline_definitions WHERE id = ?1",
            params![id],
            |row| {
                Ok(PipelineDef {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    generator_id: row.get(2)?,
                    reviewer_id: row.get(3)?,
                    max_iterations: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| format!("DB error: {e}"))?;
    Ok(p)
}

#[tauri::command]
pub fn list_pipelines(db: State<'_, AppDb>) -> Result<Vec<PipelineDef>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, generator_id, reviewer_id, max_iterations, created_at
             FROM pipeline_definitions ORDER BY created_at DESC",
        )
        .map_err(|e| format!("DB error: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(PipelineDef {
                id: row.get(0)?,
                name: row.get(1)?,
                generator_id: row.get(2)?,
                reviewer_id: row.get(3)?,
                max_iterations: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("DB error: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB error: {e}"))
}

#[tauri::command]
pub fn delete_pipeline(db: State<'_, AppDb>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
    conn.execute(
        "DELETE FROM pipeline_definitions WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("DB error: {e}"))?;
    Ok(())
}

// ─── Run history ─────────────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
fn parse_run(
    id: i64,
    pipeline_id: i64,
    worktree_id: i64,
    task_desc: String,
    status: String,
    iterations: i64,
    output_json: String,
    started_at: String,
    finished_at: Option<String>,
) -> PipelineRun {
    let output: Vec<StepOutput> = serde_json::from_str(&output_json).unwrap_or_default();
    PipelineRun {
        id,
        pipeline_id,
        worktree_id,
        task_desc,
        status,
        iterations,
        output,
        started_at,
        finished_at,
    }
}

#[tauri::command]
pub fn list_pipeline_runs(
    db: State<'_, AppDb>,
    pipeline_id: i64,
) -> Result<Vec<PipelineRun>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, pipeline_id, worktree_id, task_desc, status, iterations, output,
                    started_at, finished_at
             FROM pipeline_runs WHERE pipeline_id = ?1 ORDER BY started_at DESC LIMIT 50",
        )
        .map_err(|e| format!("DB error: {e}"))?;
    let rows = stmt
        .query_map(params![pipeline_id], |row| {
            Ok(parse_run(
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
            ))
        })
        .map_err(|e| format!("DB error: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB error: {e}"))
}

#[tauri::command]
pub fn get_pipeline_run(db: State<'_, AppDb>, run_id: i64) -> Result<PipelineRun, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
    conn.query_row(
        "SELECT id, pipeline_id, worktree_id, task_desc, status, iterations, output,
                started_at, finished_at
         FROM pipeline_runs WHERE id = ?1",
        params![run_id],
        |row| {
            Ok(parse_run(
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
            ))
        },
    )
    .map_err(|e| format!("DB error: {e}"))
}

// ─── Pipeline execution ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn run_pipeline(
    app: AppHandle,
    db: State<'_, AppDb>,
    pipeline_id: i64,
    worktree_id: i64,
    task_desc: String,
) -> Result<PipelineRun, String> {
    // Load pipeline + agents
    let (pipeline, generator, reviewer, worktree_path) = {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;

        let pipeline = conn
            .query_row(
                "SELECT id, name, generator_id, reviewer_id, max_iterations, created_at
                 FROM pipeline_definitions WHERE id = ?1",
                params![pipeline_id],
                |row| {
                    Ok(PipelineDef {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        generator_id: row.get(2)?,
                        reviewer_id: row.get(3)?,
                        max_iterations: row.get(4)?,
                        created_at: row.get(5)?,
                    })
                },
            )
            .map_err(|e| format!("Pipeline not found: {e}"))?;

        let load_agent = |agent_id: i64| -> Result<AgentDef, rusqlite::Error> {
            conn.query_row(
                "SELECT id, name, role, command, created_at FROM agent_definitions WHERE id = ?1",
                params![agent_id],
                |row| {
                    Ok(AgentDef {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        role: row.get(2)?,
                        command: row.get(3)?,
                        created_at: row.get(4)?,
                    })
                },
            )
        };

        let generator = load_agent(pipeline.generator_id)
            .map_err(|e| format!("Generator agent not found: {e}"))?;
        let reviewer = load_agent(pipeline.reviewer_id)
            .map_err(|e| format!("Reviewer agent not found: {e}"))?;

        let worktree_path: String = conn
            .query_row(
                "SELECT path FROM worktrees WHERE id = ?1",
                params![worktree_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Worktree not found: {e}"))?;

        (pipeline, generator, reviewer, worktree_path)
    };

    // Insert initial run row
    let run_id = {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
        conn.execute(
            "INSERT INTO pipeline_runs (pipeline_id, worktree_id, task_desc) VALUES (?1, ?2, ?3)",
            params![pipeline_id, worktree_id, task_desc],
        )
        .map_err(|e| format!("DB error: {e}"))?;
        conn.last_insert_rowid()
    };

    // Run the pipeline loop
    let mut steps: Vec<StepOutput> = Vec::new();
    let mut final_status = "max_iterations".to_string();
    let max = pipeline.max_iterations as u32;
    let gen_parts = split_command(&generator.command);
    let rev_parts = split_command(&reviewer.command);

    for i in 0..max {
        // ── Generator ──
        let _ = app.emit(
            "pipeline:progress",
            PipelineProgressEvent {
                run_id,
                iteration: i,
                max_iterations: max,
                phase: "generator".into(),
                status: "running".into(),
            },
        );

        let gen_result = tokio::process::Command::new(&gen_parts[0])
            .args(&gen_parts[1..])
            .current_dir(&worktree_path)
            .env("TASK", &task_desc)
            .env("ITERATION", i.to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await;

        let (gen_stdout, gen_stderr, gen_exit) = match gen_result {
            Ok(o) => (
                String::from_utf8_lossy(&o.stdout).into_owned(),
                String::from_utf8_lossy(&o.stderr).into_owned(),
                o.status.code().unwrap_or(-1),
            ),
            Err(e) => (String::new(), format!("Failed to spawn generator: {e}"), -1),
        };

        steps.push(StepOutput {
            iteration: i,
            role: "generator".into(),
            stdout: gen_stdout.clone(),
            stderr: gen_stderr,
            exit_code: gen_exit,
        });

        let _ = app.emit(
            "pipeline:progress",
            PipelineProgressEvent {
                run_id,
                iteration: i,
                max_iterations: max,
                phase: "generator".into(),
                status: "done".into(),
            },
        );

        // ── Get diff ──
        let diff = get_git_diff(&worktree_path);

        // ── Reviewer ──
        let _ = app.emit(
            "pipeline:progress",
            PipelineProgressEvent {
                run_id,
                iteration: i,
                max_iterations: max,
                phase: "reviewer".into(),
                status: "running".into(),
            },
        );
        let stdin_payload = format!(
            "=== TASK ===\n{}\n\n=== GENERATOR OUTPUT ===\n{}\n\n=== GIT DIFF ===\n{}",
            task_desc, gen_stdout, diff
        );

        let rev_result = async {
            let mut child = tokio::process::Command::new(&rev_parts[0])
                .args(&rev_parts[1..])
                .current_dir(&worktree_path)
                .env("TASK", &task_desc)
                .env("ITERATION", i.to_string())
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()?;

            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(stdin_payload.as_bytes()).await;
            }
            child.wait_with_output().await
        }
        .await;

        let (rev_stdout, rev_stderr, rev_exit) = match rev_result {
            Ok(o) => (
                String::from_utf8_lossy(&o.stdout).into_owned(),
                String::from_utf8_lossy(&o.stderr).into_owned(),
                o.status.code().unwrap_or(-1),
            ),
            Err(e) => (String::new(), format!("Failed to spawn reviewer: {e}"), -1),
        };

        let approved = is_approved(&rev_stdout);

        steps.push(StepOutput {
            iteration: i,
            role: "reviewer".into(),
            stdout: rev_stdout,
            stderr: rev_stderr,
            exit_code: rev_exit,
        });

        let _ = app.emit(
            "pipeline:progress",
            PipelineProgressEvent {
                run_id,
                iteration: i,
                max_iterations: max,
                phase: "reviewer".into(),
                status: if approved {
                    "approved".into()
                } else {
                    "rejected".into()
                },
            },
        );

        if approved {
            final_status = "approved".to_string();
            break;
        }
    }

    // Persist result
    let output_json = serde_json::to_string(&steps).unwrap_or_else(|_| "[]".into());
    let iterations = steps.iter().filter(|s| s.role == "generator").count() as i64;

    {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
        conn.execute(
            "UPDATE pipeline_runs
             SET status = ?1, iterations = ?2, output = ?3, finished_at = datetime('now')
             WHERE id = ?4",
            params![final_status, iterations, output_json, run_id],
        )
        .map_err(|e| format!("DB error: {e}"))?;
    }

    get_pipeline_run(db, run_id)
}

// ─── Single-agent task run (used by model comparison) ────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentTaskResult {
    pub command: String,
    pub label: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Run a single CLI command with a task description and return its output.
/// The command receives the task via the TASK environment variable.
#[tauri::command]
pub async fn run_agent_task(
    db: State<'_, AppDb>,
    worktree_id: i64,
    command: String,
    label: String,
    task_desc: String,
) -> Result<AgentTaskResult, String> {
    let worktree_path: String = {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {e}"))?;
        conn.query_row(
            "SELECT path FROM worktrees WHERE id = ?1",
            params![worktree_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Worktree not found: {e}"))?
    };

    let parts = split_command(&command);
    if parts.is_empty() {
        return Err("Command must not be empty".into());
    }

    let output = tokio::process::Command::new(&parts[0])
        .args(&parts[1..])
        .current_dir(&worktree_path)
        .env("TASK", &task_desc)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run command: {e}"))?;

    Ok(AgentTaskResult {
        command,
        label,
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}
