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

#[cfg(test)]
mod tests {
    use crate::db::init_test_db;
    use crate::db::queries;

    #[test]
    fn test_bookmarks_create_and_list() {
        let conn = init_test_db();
        let id = queries::insert_bookmark(&conn, None, "Deploy", "make deploy", "ops").unwrap();
        assert!(id > 0);

        let all = queries::list_bookmarks(&conn, None).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].label, "Deploy");
        assert_eq!(all[0].command, "make deploy");
        assert_eq!(all[0].tags, "ops");
    }

    #[test]
    fn test_bookmarks_project_scoped() {
        let conn = init_test_db();
        let pid = queries::insert_project(&conn, "proj", "/tmp/proj", None, None).unwrap();

        // Global bookmark
        queries::insert_bookmark(&conn, None, "Global", "echo hi", "").unwrap();
        // Project-scoped bookmark
        queries::insert_bookmark(&conn, Some(pid), "Scoped", "cargo test", "rust").unwrap();

        // With project context, both are visible
        let with_project = queries::list_bookmarks(&conn, Some(pid)).unwrap();
        assert_eq!(with_project.len(), 2);

        // Without project context, only global is visible
        let without_project = queries::list_bookmarks(&conn, None).unwrap();
        assert_eq!(without_project.len(), 1);
        assert_eq!(without_project[0].label, "Global");
    }

    #[test]
    fn test_bookmarks_update() {
        let conn = init_test_db();
        let id = queries::insert_bookmark(&conn, None, "Old label", "old cmd", "old").unwrap();

        queries::update_bookmark(&conn, id, "New label", "new cmd", "new").unwrap();

        let all = queries::list_bookmarks(&conn, None).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].label, "New label");
        assert_eq!(all[0].command, "new cmd");
        assert_eq!(all[0].tags, "new");
    }

    #[test]
    fn test_bookmarks_delete() {
        let conn = init_test_db();
        let id = queries::insert_bookmark(&conn, None, "Temp", "ls", "").unwrap();

        let deleted = queries::delete_bookmark(&conn, id).unwrap();
        assert!(deleted);

        let all = queries::list_bookmarks(&conn, None).unwrap();
        assert!(all.is_empty());
    }

    #[test]
    fn test_bookmarks_delete_nonexistent() {
        let conn = init_test_db();
        let deleted = queries::delete_bookmark(&conn, 9999).unwrap();
        assert!(!deleted);
    }
}
