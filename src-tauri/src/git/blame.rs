use crate::db::{queries, AppDb};
use chrono::{FixedOffset, TimeZone};
use git2::Repository;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct BlameLine {
    pub line_number: usize,
    pub content: String,
    pub commit_hash: String,
    pub author: String,
    pub date: String,
    pub summary: String,
}

/// Get blame information for a file in a worktree.
#[tauri::command]
pub fn blame_file(
    db: State<'_, AppDb>,
    worktree_id: i64,
    file_path: String,
) -> Result<Vec<BlameLine>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let worktree = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;

    let repo = Repository::open(&worktree.path).map_err(|e| format!("Git: {}", e))?;

    let blame = repo
        .blame_file(std::path::Path::new(&file_path), None)
        .map_err(|e| format!("Blame: {}", e))?;

    // Read file content from disk
    let full_path = std::path::Path::new(&worktree.path).join(&file_path);
    let file_content =
        std::fs::read_to_string(&full_path).map_err(|e| format!("Read file: {}", e))?;
    let lines: Vec<&str> = file_content.lines().collect();

    let mut result = Vec::with_capacity(lines.len());

    for (i, line_content) in lines.iter().enumerate() {
        let line_number = i + 1;

        if let Some(hunk) = blame.get_line(line_number) {
            let oid = hunk.final_commit_id();
            let hash = oid.to_string();

            let (author, date, summary) = match repo.find_commit(oid) {
                Ok(commit) => {
                    let author_name = commit.author().name().unwrap_or("Unknown").to_string();

                    let time = commit.author().when();
                    let offset_secs = time.offset_minutes() * 60;
                    let tz = FixedOffset::east_opt(offset_secs)
                        .unwrap_or_else(|| FixedOffset::east_opt(0).unwrap());
                    let dt = tz
                        .timestamp_opt(time.seconds(), 0)
                        .single()
                        .map(|d| d.to_rfc3339())
                        .unwrap_or_default();

                    let msg = commit.summary().unwrap_or("").to_string();

                    (author_name, dt, msg)
                }
                Err(_) => ("Unknown".to_string(), String::new(), String::new()),
            };

            result.push(BlameLine {
                line_number,
                content: line_content.to_string(),
                commit_hash: hash,
                author,
                date,
                summary,
            });
        } else {
            result.push(BlameLine {
                line_number,
                content: line_content.to_string(),
                commit_hash: String::new(),
                author: "Not Committed".to_string(),
                date: String::new(),
                summary: String::new(),
            });
        }
    }

    Ok(result)
}
