use crate::db::queries;
use crate::db::AppDb;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::embeddings;

/// Structured dead end entry.
#[derive(Debug, Serialize, Deserialize)]
pub struct DeadEnd {
    pub approach: String,
    pub failure_reason: String,
    pub error_message: Option<String>,
}

impl DeadEnd {
    /// Serialize to stored content format.
    pub fn to_content(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }

    /// Parse from stored content. Falls back to treating content as plain text.
    pub fn from_content(content: &str) -> Self {
        serde_json::from_str(content).unwrap_or(DeadEnd {
            approach: content.to_string(),
            failure_reason: String::new(),
            error_message: None,
        })
    }

    /// Generate searchable text for embedding.
    fn searchable_text(&self) -> String {
        let mut text = format!("{} {}", self.approach, self.failure_reason);
        if let Some(ref err) = self.error_message {
            text.push(' ');
            text.push_str(err);
        }
        text
    }
}

/// Structured dead end with metadata.
#[derive(Debug, Serialize)]
pub struct DeadEndEntry {
    pub id: i64,
    pub worktree_id: i64,
    pub approach: String,
    pub failure_reason: String,
    pub error_message: Option<String>,
    pub created_at: String,
}

/// Add a dead end entry for a worktree.
pub fn add_dead_end(
    app: &AppHandle,
    worktree_id: i64,
    approach: &str,
    failure_reason: &str,
    error_message: Option<&str>,
) -> Result<i64, String> {
    let dead_end = DeadEnd {
        approach: approach.to_string(),
        failure_reason: failure_reason.to_string(),
        error_message: error_message.map(|s| s.to_string()),
    };

    let content = dead_end.to_content();
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let id = queries::insert_memory_note(&conn, worktree_id, &content, "dead_end")
        .map_err(|e| format!("DB: {}", e))?;

    // Store embedding for semantic search
    let embedding = embeddings::generate_embedding(&dead_end.searchable_text());
    let blob = embeddings::to_blob(&embedding);
    queries::update_memory_note_embedding(&conn, id, &blob)
        .map_err(|e| format!("DB embedding: {}", e))?;

    Ok(id)
}

/// Get all dead ends for a worktree.
pub fn get_dead_ends(app: &AppHandle, worktree_id: i64) -> Result<Vec<DeadEndEntry>, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let notes = queries::list_memory_notes(&conn, worktree_id, Some("dead_end"))
        .map_err(|e| format!("DB: {}", e))?;

    Ok(notes
        .into_iter()
        .map(|row| {
            let de = DeadEnd::from_content(&row.content);
            DeadEndEntry {
                id: row.id,
                worktree_id: row.worktree_id,
                approach: de.approach,
                failure_reason: de.failure_reason,
                error_message: de.error_message,
                created_at: row.created_at,
            }
        })
        .collect())
}

/// Search dead ends by query text.
pub fn search_dead_ends(
    app: &AppHandle,
    worktree_id: i64,
    query: &str,
) -> Result<Vec<DeadEndEntry>, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let query_embedding = embeddings::generate_embedding(query);
    let all_notes = queries::list_memory_notes_with_embeddings(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?;

    let mut results: Vec<(DeadEndEntry, f64)> = all_notes
        .into_iter()
        .filter(|(row, _)| row.category == "dead_end")
        .map(|(row, blob)| {
            let score = blob
                .as_ref()
                .map(|b| embeddings::cosine_similarity(&query_embedding, &embeddings::from_blob(b)))
                .unwrap_or(0.0);
            let de = DeadEnd::from_content(&row.content);
            (
                DeadEndEntry {
                    id: row.id,
                    worktree_id: row.worktree_id,
                    approach: de.approach,
                    failure_reason: de.failure_reason,
                    error_message: de.error_message,
                    created_at: row.created_at,
                },
                score,
            )
        })
        .collect();

    results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    Ok(results.into_iter().map(|(entry, _)| entry).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dead_end_round_trip() {
        let de = DeadEnd {
            approach: "Use Redis for caching".into(),
            failure_reason: "Connection pool exhaustion under load".into(),
            error_message: Some("Error: Too many connections".into()),
        };

        let content = de.to_content();
        let parsed = DeadEnd::from_content(&content);

        assert_eq!(parsed.approach, "Use Redis for caching");
        assert_eq!(
            parsed.failure_reason,
            "Connection pool exhaustion under load"
        );
        assert_eq!(
            parsed.error_message.as_deref(),
            Some("Error: Too many connections")
        );
    }

    #[test]
    fn dead_end_from_plain_text() {
        let parsed = DeadEnd::from_content("Just a plain text note");
        assert_eq!(parsed.approach, "Just a plain text note");
        assert!(parsed.failure_reason.is_empty());
        assert!(parsed.error_message.is_none());
    }
}
