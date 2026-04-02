use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct TodoItem {
    pub id: i64,
    pub project_id: Option<i64>,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Create a new todo item.
#[tauri::command]
pub fn create_todo(
    db: State<'_, AppDb>,
    project_id: Option<i64>,
    title: String,
    description: Option<String>,
    priority: Option<String>,
) -> Result<i64, String> {
    let description = description.unwrap_or_default();
    let priority = priority.unwrap_or_else(|| "medium".to_string());
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO todos (project_id, title, description, priority) VALUES (?1, ?2, ?3, ?4)",
        params![project_id, title, description, priority],
    )
    .map_err(|e| format!("DB: {}", e))?;
    Ok(conn.last_insert_rowid())
}

/// List todos, optionally filtered by project and/or status.
#[tauri::command]
pub fn list_todos(
    db: State<'_, AppDb>,
    project_id: Option<i64>,
    status: Option<String>,
) -> Result<Vec<TodoItem>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let (sql, dynamic_params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match (
        &project_id,
        &status,
    ) {
        (Some(pid), Some(st)) => (
            "SELECT id, project_id, title, description, priority, status, created_at, updated_at
                 FROM todos WHERE project_id = ?1 AND status = ?2
                 ORDER BY created_at DESC"
                .to_string(),
            vec![
                Box::new(*pid) as Box<dyn rusqlite::types::ToSql>,
                Box::new(st.clone()),
            ],
        ),
        (Some(pid), None) => (
            "SELECT id, project_id, title, description, priority, status, created_at, updated_at
                 FROM todos WHERE project_id = ?1
                 ORDER BY created_at DESC"
                .to_string(),
            vec![Box::new(*pid) as Box<dyn rusqlite::types::ToSql>],
        ),
        (None, Some(st)) => (
            "SELECT id, project_id, title, description, priority, status, created_at, updated_at
                 FROM todos WHERE status = ?1
                 ORDER BY created_at DESC"
                .to_string(),
            vec![Box::new(st.clone()) as Box<dyn rusqlite::types::ToSql>],
        ),
        (None, None) => (
            "SELECT id, project_id, title, description, priority, status, created_at, updated_at
                 FROM todos ORDER BY created_at DESC"
                .to_string(),
            vec![],
        ),
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("DB: {}", e))?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        dynamic_params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(TodoItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                priority: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("DB: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB: {}", e))
}

/// Update an existing todo item.
#[tauri::command]
pub fn update_todo(
    db: State<'_, AppDb>,
    id: i64,
    title: Option<String>,
    description: Option<String>,
    priority: Option<String>,
    status: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    // Fetch current values
    let current: TodoItem = conn
        .query_row(
            "SELECT id, project_id, title, description, priority, status, created_at, updated_at
             FROM todos WHERE id = ?1",
            params![id],
            |row| {
                Ok(TodoItem {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    priority: row.get(4)?,
                    status: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .map_err(|e| format!("DB: {}", e))?;

    let title = title.unwrap_or(current.title);
    let description = description.unwrap_or(current.description);
    let priority = priority.unwrap_or(current.priority);
    let status = status.unwrap_or(current.status);

    conn.execute(
        "UPDATE todos SET title = ?1, description = ?2, priority = ?3, status = ?4, updated_at = datetime('now')
         WHERE id = ?5",
        params![title, description, priority, status, id],
    )
    .map_err(|e| format!("DB: {}", e))?;
    Ok(())
}

/// Delete a todo item.
#[tauri::command]
pub fn delete_todo(db: State<'_, AppDb>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute("DELETE FROM todos WHERE id = ?1", params![id])
        .map_err(|e| format!("DB: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::db::init_test_db;
    use rusqlite::params;

    use super::TodoItem;

    /// Helper: insert a todo directly on a Connection.
    fn insert_todo(
        conn: &rusqlite::Connection,
        project_id: Option<i64>,
        title: &str,
        description: &str,
        priority: &str,
    ) -> i64 {
        conn.execute(
            "INSERT INTO todos (project_id, title, description, priority) VALUES (?1, ?2, ?3, ?4)",
            params![project_id, title, description, priority],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    /// Helper: list all todos.
    fn list_all_todos(conn: &rusqlite::Connection) -> Vec<TodoItem> {
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, title, description, priority, status, created_at, updated_at
                 FROM todos ORDER BY created_at DESC",
            )
            .unwrap();
        stmt.query_map([], |row| {
            Ok(TodoItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                priority: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    }

    #[test]
    fn test_todos_create_and_list() {
        let conn = init_test_db();
        let id = insert_todo(&conn, None, "Write tests", "Add unit tests", "high");
        assert!(id > 0);

        let todos = list_all_todos(&conn);
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].title, "Write tests");
        assert_eq!(todos[0].description, "Add unit tests");
        assert_eq!(todos[0].priority, "high");
        assert_eq!(todos[0].status, "todo");
    }

    #[test]
    fn test_todos_default_priority_via_schema() {
        let conn = init_test_db();
        // Insert without explicit priority — schema default is 'medium'
        conn.execute(
            "INSERT INTO todos (title) VALUES (?1)",
            params!["No priority"],
        )
        .unwrap();

        let todos = list_all_todos(&conn);
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].priority, "medium");
        assert_eq!(todos[0].status, "todo");
    }

    #[test]
    fn test_todos_update() {
        let conn = init_test_db();
        let id = insert_todo(&conn, None, "Original", "", "low");

        conn.execute(
            "UPDATE todos SET title = ?1, priority = ?2, status = ?3, updated_at = datetime('now')
             WHERE id = ?4",
            params!["Updated", "high", "in_progress", id],
        )
        .unwrap();

        let todos = list_all_todos(&conn);
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].title, "Updated");
        assert_eq!(todos[0].priority, "high");
        assert_eq!(todos[0].status, "in_progress");
    }

    #[test]
    fn test_todos_delete() {
        let conn = init_test_db();
        let id = insert_todo(&conn, None, "Temp", "", "medium");

        conn.execute("DELETE FROM todos WHERE id = ?1", params![id])
            .unwrap();

        let todos = list_all_todos(&conn);
        assert!(todos.is_empty());
    }

    #[test]
    fn test_todos_invalid_priority_rejected() {
        let conn = init_test_db();
        let result = conn.execute(
            "INSERT INTO todos (title, priority) VALUES (?1, ?2)",
            params!["Bad", "critical"],
        );
        assert!(
            result.is_err(),
            "Invalid priority should be rejected by CHECK constraint"
        );
    }
}
