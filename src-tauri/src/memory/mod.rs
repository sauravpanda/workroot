pub mod embeddings;

use crate::db::queries;
use crate::db::AppDb;
use serde::{Deserialize, Serialize};
use tauri::State;

/// A memory entry with optional similarity score.
#[derive(Debug, Serialize)]
pub struct MemoryEntry {
    pub id: i64,
    pub worktree_id: i64,
    pub content: String,
    pub category: String,
    pub created_at: String,
    pub score: Option<f64>,
}

impl From<queries::MemoryNoteRow> for MemoryEntry {
    fn from(row: queries::MemoryNoteRow) -> Self {
        MemoryEntry {
            id: row.id,
            worktree_id: row.worktree_id,
            content: row.content,
            category: row.category,
            created_at: row.created_at,
            score: None,
        }
    }
}

/// Input for creating a memory note.
#[derive(Debug, Deserialize)]
pub struct CreateNoteInput {
    pub content: String,
    pub category: String,
}

#[tauri::command]
pub fn add_memory_note(
    db: State<'_, AppDb>,
    worktree_id: i64,
    content: String,
    category: String,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Insert the note
    let id = queries::insert_memory_note(&conn, worktree_id, &content, &category)
        .map_err(|e| format!("DB: {}", e))?;

    // Generate and store embedding
    let embedding = embeddings::generate_embedding(&content);
    let blob = embeddings::to_blob(&embedding);
    queries::update_memory_note_embedding(&conn, id, &blob)
        .map_err(|e| format!("DB embedding: {}", e))?;

    Ok(id)
}

#[tauri::command]
pub fn get_memory_notes(
    db: State<'_, AppDb>,
    worktree_id: i64,
    category: Option<String>,
) -> Result<Vec<MemoryEntry>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let notes = queries::list_memory_notes(&conn, worktree_id, category.as_deref())
        .map_err(|e| format!("DB: {}", e))?;

    Ok(notes.into_iter().map(MemoryEntry::from).collect())
}

#[tauri::command]
pub fn search_memory_notes(
    db: State<'_, AppDb>,
    worktree_id: i64,
    query: String,
) -> Result<Vec<MemoryEntry>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let query_embedding = embeddings::generate_embedding(&query);
    let all_notes = queries::list_memory_notes_with_embeddings(&conn, worktree_id)
        .map_err(|e| format!("DB: {}", e))?;

    let mut scored: Vec<MemoryEntry> = all_notes
        .into_iter()
        .map(|(row, blob)| {
            let score = blob
                .as_ref()
                .map(|b| embeddings::cosine_similarity(&query_embedding, &embeddings::from_blob(b)))
                .unwrap_or(0.0);
            MemoryEntry {
                id: row.id,
                worktree_id: row.worktree_id,
                content: row.content,
                category: row.category,
                created_at: row.created_at,
                score: Some(score),
            }
        })
        .collect();

    // Sort by score descending
    scored.sort_by(|a, b| {
        b.score
            .unwrap_or(0.0)
            .partial_cmp(&a.score.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Return top 50
    scored.truncate(50);
    Ok(scored)
}

#[tauri::command]
pub fn delete_memory_note(db: State<'_, AppDb>, note_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    queries::delete_memory_note(&conn, note_id).map_err(|e| format!("DB: {}", e))
}

#[tauri::command]
pub fn update_memory_note(
    db: State<'_, AppDb>,
    note_id: i64,
    content: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    queries::update_memory_note_content(&conn, note_id, &content)
        .map_err(|e| format!("DB: {}", e))?;

    // Regenerate embedding
    let embedding = embeddings::generate_embedding(&content);
    let blob = embeddings::to_blob(&embedding);
    queries::update_memory_note_embedding(&conn, note_id, &blob)
        .map_err(|e| format!("DB embedding: {}", e))?;

    Ok(())
}
