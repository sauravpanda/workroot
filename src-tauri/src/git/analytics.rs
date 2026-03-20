use crate::db::{queries, AppDb};
use git2::Repository;
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct AuthorStat {
    pub name: String,
    pub email: String,
    pub commit_count: usize,
    pub first_commit: String,
    pub last_commit: String,
}

#[derive(Debug, Serialize)]
pub struct DayCount {
    pub date: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct CommitStats {
    pub total_commits: usize,
    pub authors: Vec<AuthorStat>,
    pub commits_by_day: Vec<DayCount>,
    pub avg_commits_per_week: f64,
}

/// Get git analytics for a worktree, looking back N days.
#[tauri::command]
pub fn get_git_analytics(
    db: State<'_, AppDb>,
    worktree_id: i64,
    days: i64,
) -> Result<CommitStats, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let wt = queries::get_worktree(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?
        .ok_or("Worktree not found")?;
    drop(conn);

    let repo = Repository::open(&wt.path).map_err(|e| format!("Git: {}", e))?;

    let mut revwalk = repo.revwalk().map_err(|e| format!("Revwalk: {}", e))?;
    revwalk
        .push_head()
        .map_err(|e| format!("Revwalk push HEAD: {}", e))?;
    revwalk.set_sorting(git2::Sort::TIME).ok();

    let now = chrono::Utc::now();
    let cutoff = now - chrono::Duration::days(days);
    let cutoff_ts = cutoff.timestamp();

    // author email -> (name, email, count, first_ts, last_ts)
    let mut author_map: HashMap<String, (String, String, usize, i64, i64)> = HashMap::new();
    // date string -> count
    let mut day_map: HashMap<String, usize> = HashMap::new();
    let mut total_commits: usize = 0;

    for oid_result in revwalk {
        let oid = oid_result.map_err(|e| format!("Revwalk: {}", e))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("Find commit: {}", e))?;
        let commit_ts = commit.time().seconds();

        if commit_ts < cutoff_ts {
            break;
        }

        total_commits += 1;

        let author = commit.author();
        let name = String::from_utf8_lossy(author.name_bytes()).to_string();
        let email = String::from_utf8_lossy(author.email_bytes()).to_string();

        let entry = author_map.entry(email.clone()).or_insert((
            name.clone(),
            email,
            0,
            commit_ts,
            commit_ts,
        ));
        entry.2 += 1;
        if commit_ts < entry.3 {
            entry.3 = commit_ts;
        }
        if commit_ts > entry.4 {
            entry.4 = commit_ts;
        }

        // Format date as YYYY-MM-DD
        let dt = chrono::DateTime::from_timestamp(commit_ts, 0).unwrap_or(now);
        let date_str = dt.format("%Y-%m-%d").to_string();
        *day_map.entry(date_str).or_insert(0) += 1;
    }

    let mut authors: Vec<AuthorStat> = author_map
        .into_values()
        .map(|(name, email, count, first_ts, last_ts)| {
            let first = chrono::DateTime::from_timestamp(first_ts, 0)
                .unwrap_or(now)
                .format("%Y-%m-%d")
                .to_string();
            let last = chrono::DateTime::from_timestamp(last_ts, 0)
                .unwrap_or(now)
                .format("%Y-%m-%d")
                .to_string();
            AuthorStat {
                name,
                email,
                commit_count: count,
                first_commit: first,
                last_commit: last,
            }
        })
        .collect();
    authors.sort_by(|a, b| b.commit_count.cmp(&a.commit_count));

    let mut commits_by_day: Vec<DayCount> = day_map
        .into_iter()
        .map(|(date, count)| DayCount { date, count })
        .collect();
    commits_by_day.sort_by(|a, b| a.date.cmp(&b.date));

    let weeks = (days as f64) / 7.0;
    let avg_commits_per_week = if weeks > 0.0 {
        total_commits as f64 / weeks
    } else {
        0.0
    };

    Ok(CommitStats {
        total_commits,
        authors,
        commits_by_day,
        avg_commits_per_week,
    })
}
