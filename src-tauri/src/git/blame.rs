use crate::db::{queries, AppDb};
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

/// Get blame information for a file.
#[tauri::command]
pub fn blame_file(
    db: State<'_, AppDb>,
    worktree_id: i64,
    file_path: String,
) -> Result<Vec<BlameLine>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;

    let blame = repo
        .blame_file(std::path::Path::new(&file_path), None)
        .map_err(|e| format!("Blame: {}", e))?;

    // Read the file contents to pair with blame data
    let full_path = std::path::Path::new(&wt.path).join(&file_path);
    let content = std::fs::read_to_string(&full_path).map_err(|e| format!("Read file: {}", e))?;

    let lines: Vec<&str> = content.lines().collect();
    let mut result = Vec::new();

    for (i, line_content) in lines.iter().enumerate() {
        let line_num = i + 1; // blame uses 1-based line numbers
        if let Some(hunk) = blame.get_line(line_num) {
            let commit_id = hunk.final_commit_id();
            let sig = hunk.final_signature();
            let author = String::from_utf8_lossy(sig.name_bytes()).to_string();
            let date = sig.when().seconds().to_string();

            // Try to get the commit summary
            let summary = repo
                .find_commit(commit_id)
                .ok()
                .and_then(|c| c.summary().map(|s| s.to_string()))
                .unwrap_or_default();

            result.push(BlameLine {
                line_number: line_num,
                content: line_content.to_string(),
                commit_hash: commit_id.to_string(),
                author,
                date,
                summary,
            });
        }
    }

    Ok(result)
}
