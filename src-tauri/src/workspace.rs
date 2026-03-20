use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceLayout {
    pub id: i64,
    pub name: String,
    pub config: String,
    pub created_at: String,
}

/// Save a workspace layout.
#[tauri::command]
pub fn save_workspace(db: State<'_, AppDb>, name: String, config: String) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO workspace_layouts (name, config) VALUES (?1, ?2)",
        params![name, config],
    )
    .map_err(|e| format!("DB: {}", e))?;
    Ok(conn.last_insert_rowid())
}

/// List all saved workspace layouts.
#[tauri::command]
pub fn list_workspaces(db: State<'_, AppDb>) -> Result<Vec<WorkspaceLayout>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, config, created_at FROM workspace_layouts ORDER BY created_at DESC",
        )
        .map_err(|e| format!("DB: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(WorkspaceLayout {
                id: row.get(0)?,
                name: row.get(1)?,
                config: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("DB: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB: {}", e))
}

/// Load a specific workspace layout by ID.
#[tauri::command]
pub fn load_workspace(db: State<'_, AppDb>, id: i64) -> Result<WorkspaceLayout, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, name, config, created_at FROM workspace_layouts WHERE id = ?1")
        .map_err(|e| format!("DB: {}", e))?;
    let mut rows = stmt
        .query_map(params![id], |row| {
            Ok(WorkspaceLayout {
                id: row.get(0)?,
                name: row.get(1)?,
                config: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("DB: {}", e))?;
    match rows.next() {
        Some(row) => row.map_err(|e| format!("DB: {}", e)),
        None => Err("Workspace not found".to_string()),
    }
}

/// Delete a workspace layout by ID.
#[tauri::command]
pub fn delete_workspace(db: State<'_, AppDb>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute("DELETE FROM workspace_layouts WHERE id = ?1", params![id])
        .map_err(|e| format!("DB: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::db::init_test_db;
    use rusqlite::params;

    use super::WorkspaceLayout;

    /// Helper: insert a workspace layout directly.
    fn insert_layout(conn: &rusqlite::Connection, name: &str, config: &str) -> i64 {
        conn.execute(
            "INSERT INTO workspace_layouts (name, config) VALUES (?1, ?2)",
            params![name, config],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    /// Helper: list all workspace layouts.
    fn list_layouts(conn: &rusqlite::Connection) -> Vec<WorkspaceLayout> {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, config, created_at FROM workspace_layouts ORDER BY created_at DESC",
            )
            .unwrap();
        stmt.query_map([], |row| {
            Ok(WorkspaceLayout {
                id: row.get(0)?,
                name: row.get(1)?,
                config: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    }

    /// Helper: load a workspace layout by id.
    fn load_layout(conn: &rusqlite::Connection, id: i64) -> Option<WorkspaceLayout> {
        let mut stmt = conn
            .prepare("SELECT id, name, config, created_at FROM workspace_layouts WHERE id = ?1")
            .unwrap();
        let mut rows = stmt
            .query_map(params![id], |row| {
                Ok(WorkspaceLayout {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    config: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .unwrap();
        rows.next().map(|r| r.unwrap())
    }

    #[test]
    fn test_workspace_create_and_list() {
        let conn = init_test_db();
        let id = insert_layout(&conn, "Dev Layout", r#"{"panels":["editor","terminal"]}"#);
        assert!(id > 0);

        let layouts = list_layouts(&conn);
        assert_eq!(layouts.len(), 1);
        assert_eq!(layouts[0].name, "Dev Layout");
        assert!(layouts[0].config.contains("editor"));
    }

    #[test]
    fn test_workspace_load_by_id() {
        let conn = init_test_db();
        let id = insert_layout(&conn, "Test Layout", r#"{"split":"vertical"}"#);

        let layout = load_layout(&conn, id).expect("layout should exist");
        assert_eq!(layout.name, "Test Layout");
        assert_eq!(layout.config, r#"{"split":"vertical"}"#);
    }

    #[test]
    fn test_workspace_load_nonexistent() {
        let conn = init_test_db();
        let layout = load_layout(&conn, 9999);
        assert!(layout.is_none());
    }

    #[test]
    fn test_workspace_delete() {
        let conn = init_test_db();
        let id = insert_layout(&conn, "Temp", "{}");

        conn.execute("DELETE FROM workspace_layouts WHERE id = ?1", params![id])
            .unwrap();

        let layouts = list_layouts(&conn);
        assert!(layouts.is_empty());
    }

    #[test]
    fn test_workspace_multiple_layouts() {
        let conn = init_test_db();
        insert_layout(&conn, "Layout A", r#"{"a":1}"#);
        insert_layout(&conn, "Layout B", r#"{"b":2}"#);
        insert_layout(&conn, "Layout C", r#"{"c":3}"#);

        let layouts = list_layouts(&conn);
        assert_eq!(layouts.len(), 3);
    }
}
