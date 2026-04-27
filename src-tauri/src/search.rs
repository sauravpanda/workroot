use crate::db::AppDb;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

/// A single result from the unified search.
#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub result_type: String,
    pub title: String,
    pub subtitle: String,
    pub action_data: String,
}

/// Score a match for ordering: exact > starts_with > contains.
fn relevance_score(haystack: &str, query: &str) -> u8 {
    let h = haystack.to_lowercase();
    let q = query.to_lowercase();
    if h == q {
        3
    } else if h.starts_with(&q) {
        2
    } else if h.contains(&q) {
        1
    } else {
        0
    }
}

/// Search across command_bookmarks, shell_history, memory_notes, and settings.
/// Returns up to 50 results ordered by relevance (exact > starts_with > contains).
#[tauri::command]
pub fn unified_search(
    db: State<'_, AppDb>,
    query: String,
    project_id: Option<i64>,
) -> Result<Vec<SearchResult>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut results: Vec<(u8, SearchResult)> = Vec::new();
    let like_pattern = format!("%{}%", query);

    // Search command_bookmarks (label, command)
    {
        let (sql, use_project) = if project_id.is_some() {
            (
                "SELECT id, label, command, tags FROM command_bookmarks
                 WHERE (label LIKE ?1 OR command LIKE ?1) AND project_id = ?2
                 LIMIT 50",
                true,
            )
        } else {
            (
                "SELECT id, label, command, tags FROM command_bookmarks
                 WHERE label LIKE ?1 OR command LIKE ?1
                 LIMIT 50",
                false,
            )
        };

        let mut stmt = conn.prepare(sql).map_err(|e| format!("Query: {}", e))?;

        let collect_row = |row: &rusqlite::Row| -> rusqlite::Result<(i64, String, String, String)> {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        };

        let rows: Vec<(i64, String, String, String)> = if use_project {
            let pid = project_id.unwrap();
            stmt.query_map(params![&like_pattern, pid], collect_row)
                .map_err(|e| format!("Query: {}", e))?
                .filter_map(|r| r.ok())
                .collect()
        } else {
            stmt.query_map(params![&like_pattern], collect_row)
                .map_err(|e| format!("Query: {}", e))?
                .filter_map(|r| r.ok())
                .collect()
        };

        for (id, label, command, _tags) in rows {
            let score = relevance_score(&label, &query).max(relevance_score(&command, &query));
            if score > 0 {
                let action = serde_json::json!({
                    "type": "bookmark",
                    "id": id,
                    "command": command,
                })
                .to_string();

                results.push((
                    score,
                    SearchResult {
                        result_type: "command".to_string(),
                        title: label,
                        subtitle: command,
                        action_data: action,
                    },
                ));
            }
        }
    }

    // Search shell_history (command)
    {
        let (sql, use_project) = if project_id.is_some() {
            (
                "SELECT id, command, cwd FROM shell_history
                 WHERE command LIKE ?1 AND project_id = ?2
                 ORDER BY timestamp DESC LIMIT 50",
                true,
            )
        } else {
            (
                "SELECT id, command, cwd FROM shell_history
                 WHERE command LIKE ?1
                 ORDER BY timestamp DESC LIMIT 50",
                false,
            )
        };

        let mut stmt = conn.prepare(sql).map_err(|e| format!("Query: {}", e))?;

        let collect_row = |row: &rusqlite::Row| -> rusqlite::Result<(i64, String, Option<String>)> {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        };

        let rows: Vec<(i64, String, Option<String>)> = if use_project {
            let pid = project_id.unwrap();
            stmt.query_map(params![&like_pattern, pid], collect_row)
                .map_err(|e| format!("Query: {}", e))?
                .filter_map(|r| r.ok())
                .collect()
        } else {
            stmt.query_map(params![&like_pattern], collect_row)
                .map_err(|e| format!("Query: {}", e))?
                .filter_map(|r| r.ok())
                .collect()
        };

        for (id, command, cwd) in rows {
            let score = relevance_score(&command, &query);
            if score > 0 {
                let action = serde_json::json!({
                    "type": "history",
                    "id": id,
                    "command": command,
                })
                .to_string();

                results.push((
                    score,
                    SearchResult {
                        result_type: "history".to_string(),
                        title: command,
                        subtitle: cwd.unwrap_or_default(),
                        action_data: action,
                    },
                ));
            }
        }
    }

    // Search memory_notes (content)
    {
        let sql = "SELECT id, content, category FROM memory_notes
                   WHERE content LIKE ?1
                   ORDER BY created_at DESC LIMIT 50";

        let mut stmt = conn.prepare(sql).map_err(|e| format!("Query: {}", e))?;

        let rows: Vec<(i64, String, String)> = stmt
            .query_map(params![&like_pattern], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| format!("Query: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        for (id, content, category) in rows {
            let score = relevance_score(&content, &query);
            if score > 0 {
                let action = serde_json::json!({
                    "type": "note",
                    "id": id,
                    "category": category,
                })
                .to_string();

                // Truncate content for the title
                let title = if content.chars().count() > 80 {
                    let truncated: String = content.chars().take(80).collect();
                    format!("{truncated}...")
                } else {
                    content
                };

                results.push((
                    score,
                    SearchResult {
                        result_type: "note".to_string(),
                        title,
                        subtitle: category,
                        action_data: action,
                    },
                ));
            }
        }
    }

    // Search settings (key)
    {
        let sql = "SELECT key, value FROM settings WHERE key LIKE ?1 LIMIT 50";
        let mut stmt = conn.prepare(sql).map_err(|e| format!("Query: {}", e))?;

        let rows: Vec<(String, String)> = stmt
            .query_map(params![&like_pattern], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| format!("Query: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        for (key, value) in rows {
            let score = relevance_score(&key, &query);
            if score > 0 {
                let action = serde_json::json!({
                    "type": "setting",
                    "key": key,
                })
                .to_string();

                results.push((
                    score,
                    SearchResult {
                        result_type: "setting".to_string(),
                        title: key,
                        subtitle: value,
                        action_data: action,
                    },
                ));
            }
        }
    }

    // Sort by relevance (highest first), then take top 50
    results.sort_by_key(|r| std::cmp::Reverse(r.0));
    let final_results: Vec<SearchResult> = results.into_iter().take(50).map(|(_, r)| r).collect();

    Ok(final_results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_test_db, AppDb};

    fn setup_db() -> AppDb {
        let conn = init_test_db();
        conn.execute(
            "INSERT INTO projects (id, name, local_path) VALUES (1, 'test-proj', '/tmp/test')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO worktrees (id, project_id, branch_name, path) VALUES (1, 1, 'main', '/tmp/test')",
            [],
        )
        .unwrap();
        AppDb(std::sync::Arc::new(std::sync::Mutex::new(conn)))
    }

    /// Run the search logic directly against the connection (bypassing Tauri State).
    fn do_search(db: &AppDb, query: &str, _project_id: Option<i64>) -> Vec<SearchResult> {
        let conn = db.0.lock().unwrap();
        let mut results: Vec<(u8, SearchResult)> = Vec::new();
        let like_pattern = format!("%{}%", query);

        // Search command_bookmarks
        {
            let sql = "SELECT id, label, command, tags FROM command_bookmarks WHERE label LIKE ?1 OR command LIKE ?1 LIMIT 50";
            let mut stmt = conn.prepare(sql).unwrap();
            let rows: Vec<(i64, String, String, String)> = stmt
                .query_map(params![&like_pattern], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();

            for (id, label, command, _tags) in rows {
                let score = relevance_score(&label, query).max(relevance_score(&command, query));
                if score > 0 {
                    let action =
                        serde_json::json!({"type": "bookmark", "id": id, "command": command})
                            .to_string();
                    results.push((
                        score,
                        SearchResult {
                            result_type: "command".to_string(),
                            title: label,
                            subtitle: command,
                            action_data: action,
                        },
                    ));
                }
            }
        }

        // Search shell_history
        {
            let sql = "SELECT id, command, cwd FROM shell_history WHERE command LIKE ?1 ORDER BY timestamp DESC LIMIT 50";
            let mut stmt = conn.prepare(sql).unwrap();
            let rows: Vec<(i64, String, Option<String>)> = stmt
                .query_map(params![&like_pattern], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();

            for (id, command, cwd) in rows {
                let score = relevance_score(&command, query);
                if score > 0 {
                    let action =
                        serde_json::json!({"type": "history", "id": id, "command": command})
                            .to_string();
                    results.push((
                        score,
                        SearchResult {
                            result_type: "history".to_string(),
                            title: command,
                            subtitle: cwd.unwrap_or_default(),
                            action_data: action,
                        },
                    ));
                }
            }
        }

        // Search memory_notes
        {
            let sql = "SELECT id, content, category FROM memory_notes WHERE content LIKE ?1 ORDER BY created_at DESC LIMIT 50";
            let mut stmt = conn.prepare(sql).unwrap();
            let rows: Vec<(i64, String, String)> = stmt
                .query_map(params![&like_pattern], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();

            for (id, content, category) in rows {
                let score = relevance_score(&content, query);
                if score > 0 {
                    let action =
                        serde_json::json!({"type": "note", "id": id, "category": category})
                            .to_string();
                    let title = if content.len() > 80 {
                        format!("{}...", &content[..80])
                    } else {
                        content
                    };
                    results.push((
                        score,
                        SearchResult {
                            result_type: "note".to_string(),
                            title,
                            subtitle: category,
                            action_data: action,
                        },
                    ));
                }
            }
        }

        results.sort_by(|a, b| b.0.cmp(&a.0));
        results.into_iter().take(50).map(|(_, r)| r).collect()
    }

    #[test]
    fn test_search_bookmarks() {
        let db = setup_db();
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO command_bookmarks (project_id, label, command, tags) VALUES (1, 'Deploy Production', 'kubectl apply -f prod.yaml', 'k8s')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO command_bookmarks (project_id, label, command, tags) VALUES (1, 'Run Tests', 'cargo test', 'dev')",
                [],
            ).unwrap();
        }

        let results = do_search(&db, "deploy", None);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].result_type, "command");
        assert_eq!(results[0].title, "Deploy Production");
    }

    #[test]
    fn test_search_shell_history() {
        let db = setup_db();
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO shell_history (project_id, command, cwd) VALUES (1, 'git status', '/tmp/test')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO shell_history (project_id, command, cwd) VALUES (1, 'git log --oneline', '/tmp/test')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO shell_history (project_id, command, cwd) VALUES (1, 'cargo build', '/tmp/test')",
                [],
            ).unwrap();
        }

        let results = do_search(&db, "git", None);
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| r.result_type == "history"));
    }

    #[test]
    fn test_search_memory_notes() {
        let db = setup_db();
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO memory_notes (worktree_id, content, category) VALUES (1, 'Remember to fix auth bug', 'note')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO memory_notes (worktree_id, content, category) VALUES (1, 'Database migration failed', 'dead_end')",
                [],
            ).unwrap();
        }

        let results = do_search(&db, "auth", None);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].result_type, "note");
        assert!(results[0].title.contains("auth"));
    }

    #[test]
    fn test_search_ranking() {
        let db = setup_db();
        {
            let conn = db.0.lock().unwrap();
            // Exact match on label
            conn.execute(
                "INSERT INTO command_bookmarks (project_id, label, command, tags) VALUES (1, 'deploy', 'deploy.sh', '')",
                [],
            ).unwrap();
            // Starts-with match
            conn.execute(
                "INSERT INTO command_bookmarks (project_id, label, command, tags) VALUES (1, 'deploy-staging', 'deploy-staging.sh', '')",
                [],
            ).unwrap();
            // Contains match
            conn.execute(
                "INSERT INTO command_bookmarks (project_id, label, command, tags) VALUES (1, 'run auto-deploy script', 'auto-deploy.sh', '')",
                [],
            ).unwrap();
        }

        let results = do_search(&db, "deploy", None);
        assert_eq!(results.len(), 3);
        // Exact match should come first (score 3), then starts_with (score 2), then contains (score 1)
        assert_eq!(results[0].title, "deploy");
        assert_eq!(results[1].title, "deploy-staging");
        assert_eq!(results[2].title, "run auto-deploy script");
    }

    #[test]
    fn test_search_limit() {
        let db = setup_db();
        {
            let conn = db.0.lock().unwrap();
            // Insert 60 bookmarks that all match "item"
            for i in 0..60 {
                conn.execute(
                    "INSERT INTO command_bookmarks (project_id, label, command, tags) VALUES (1, ?1, ?2, '')",
                    params![format!("item-{}", i), format!("cmd-item-{}", i)],
                ).unwrap();
            }
        }

        let results = do_search(&db, "item", None);
        // The SQL LIMIT is 50, and the final take(50) also caps it
        assert!(
            results.len() <= 50,
            "should not exceed 50 results, got {}",
            results.len()
        );
    }
}
