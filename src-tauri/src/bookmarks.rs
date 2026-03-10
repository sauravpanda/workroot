use crate::db::queries;
use crate::db::AppDb;
use tauri::State;

#[tauri::command]
pub fn create_bookmark(
    db: State<'_, AppDb>,
    project_id: Option<i64>,
    label: String,
    command: String,
    tags: String,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    queries::insert_bookmark(&conn, project_id, &label, &command, &tags)
        .map_err(|e| format!("Failed to create bookmark: {}", e))
}

#[tauri::command]
pub fn list_bookmarks(
    db: State<'_, AppDb>,
    project_id: Option<i64>,
) -> Result<Vec<queries::BookmarkRow>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    queries::list_bookmarks(&conn, project_id)
        .map_err(|e| format!("Failed to list bookmarks: {}", e))
}

#[tauri::command]
pub fn update_bookmark(
    db: State<'_, AppDb>,
    id: i64,
    label: String,
    command: String,
    tags: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    queries::update_bookmark(&conn, id, &label, &command, &tags)
        .map_err(|e| format!("Failed to update bookmark: {}", e))
}

#[tauri::command]
pub fn delete_bookmark(db: State<'_, AppDb>, id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    queries::delete_bookmark(&conn, id).map_err(|e| format!("Failed to delete bookmark: {}", e))
}
