use crate::db::queries;
use crate::db::AppDb;
use crate::memory::embeddings;
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// MCP tool: get all notes for a worktree.
pub fn get_session_memory(app: &AppHandle, worktree_id: i64) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let notes =
        queries::list_memory_notes(&conn, worktree_id, None).map_err(|e| format!("DB: {}", e))?;

    // Limit to 50
    let notes: Vec<_> = notes.into_iter().take(50).collect();
    serde_json::to_value(&notes).map_err(|e| format!("Serialize: {}", e))
}

/// MCP tool: semantic search across notes.
pub fn search_memory(app: &AppHandle, worktree_id: i64, query: &str) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let query_embedding = embeddings::generate_embedding(query);
    let all_notes = queries::list_memory_notes_with_embeddings(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?;

    let mut scored: Vec<Value> = all_notes
        .into_iter()
        .map(|(row, blob)| {
            let score = blob
                .as_ref()
                .map(|b| embeddings::cosine_similarity(&query_embedding, &embeddings::from_blob(b)))
                .unwrap_or(0.0);
            serde_json::json!({
                "id": row.id,
                "content": if row.content.len() > 500 {
                    format!("{}...", &row.content[..500])
                } else {
                    row.content
                },
                "category": row.category,
                "created_at": row.created_at,
                "score": score,
            })
        })
        .collect();

    // Sort by score descending
    scored.sort_by(|a, b| {
        let sa = a["score"].as_f64().unwrap_or(0.0);
        let sb = b["score"].as_f64().unwrap_or(0.0);
        sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
    });

    scored.truncate(50);
    Ok(Value::Array(scored))
}

/// MCP tool: create a new note.
pub fn add_memory(
    app: &AppHandle,
    worktree_id: i64,
    content: &str,
    category: &str,
) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let id = queries::insert_memory_note(&conn, worktree_id, content, category)
        .map_err(|e| format!("DB: {}", e))?;

    let embedding = embeddings::generate_embedding(content);
    let blob = embeddings::to_blob(&embedding);
    queries::update_memory_note_embedding(&conn, id, &blob)
        .map_err(|e| format!("DB embedding: {}", e))?;

    Ok(serde_json::json!({ "id": id, "created": true }))
}

/// MCP tool: get decision notes only.
pub fn get_decisions(app: &AppHandle, worktree_id: i64) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let notes = queries::list_memory_notes(&conn, worktree_id, Some("decision"))
        .map_err(|e| format!("DB: {}", e))?;

    let notes: Vec<_> = notes.into_iter().take(50).collect();
    serde_json::to_value(&notes).map_err(|e| format!("Serialize: {}", e))
}

/// MCP tool: get dead end notes only.
pub fn get_dead_ends(app: &AppHandle, worktree_id: i64) -> Result<Value, String> {
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let notes = queries::list_memory_notes(&conn, worktree_id, Some("dead_end"))
        .map_err(|e| format!("DB: {}", e))?;

    let notes: Vec<_> = notes.into_iter().take(50).collect();
    serde_json::to_value(&notes).map_err(|e| format!("Serialize: {}", e))
}
