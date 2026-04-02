use crate::db::AppDb;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct ClipboardEntry {
    pub id: i64,
    pub content: String,
    pub source: String,
    pub created_at: String,
}

/// Add a clipboard entry.
#[tauri::command]
pub fn add_clipboard_entry(
    db: State<'_, AppDb>,
    content: String,
    source: String,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO clipboard_history (content, source) VALUES (?1, ?2)",
        params![content, source],
    )
    .map_err(|e| format!("DB: {}", e))?;
    Ok(conn.last_insert_rowid())
}

/// List recent clipboard entries.
#[tauri::command]
pub fn list_clipboard_entries(
    db: State<'_, AppDb>,
    limit: Option<i64>,
) -> Result<Vec<ClipboardEntry>, String> {
    let limit = limit.unwrap_or(50);
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, content, source, created_at
             FROM clipboard_history ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|e| format!("DB: {}", e))?;
    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(ClipboardEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                source: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("DB: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB: {}", e))
}

/// Search clipboard entries by content.
#[tauri::command]
pub fn search_clipboard(
    db: State<'_, AppDb>,
    query: String,
) -> Result<Vec<ClipboardEntry>, String> {
    let pattern = format!("%{}%", query);
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, content, source, created_at
             FROM clipboard_history WHERE content LIKE ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| format!("DB: {}", e))?;
    let rows = stmt
        .query_map(params![pattern], |row| {
            Ok(ClipboardEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                source: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("DB: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB: {}", e))
}

/// Clear all clipboard history.
#[tauri::command]
pub fn clear_clipboard_history(db: State<'_, AppDb>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute("DELETE FROM clipboard_history", [])
        .map_err(|e| format!("DB: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::db::init_test_db;
    use rusqlite::params;

    /// Helper: insert a clipboard entry directly on a Connection.
    fn insert_entry(conn: &rusqlite::Connection, content: &str, source: &str) -> i64 {
        conn.execute(
            "INSERT INTO clipboard_history (content, source) VALUES (?1, ?2)",
            params![content, source],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    /// Helper: list clipboard entries directly.
    fn list_entries(conn: &rusqlite::Connection, limit: i64) -> Vec<super::ClipboardEntry> {
        let mut stmt = conn
            .prepare(
                "SELECT id, content, source, created_at
                 FROM clipboard_history ORDER BY created_at DESC LIMIT ?1",
            )
            .unwrap();
        stmt.query_map(params![limit], |row| {
            Ok(super::ClipboardEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                source: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    }

    #[test]
    fn test_clipboard_create_and_list() {
        let conn = init_test_db();
        let id = insert_entry(&conn, "hello world", "manual");
        assert!(id > 0);

        let entries = list_entries(&conn, 50);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "hello world");
        assert_eq!(entries[0].source, "manual");
    }

    #[test]
    fn test_clipboard_list_respects_limit() {
        let conn = init_test_db();
        for i in 0..5 {
            insert_entry(&conn, &format!("item {}", i), "test");
        }

        let entries = list_entries(&conn, 3);
        assert_eq!(entries.len(), 3);
    }

    #[test]
    fn test_clipboard_search() {
        let conn = init_test_db();
        insert_entry(&conn, "password: secret123", "app");
        insert_entry(&conn, "hello world", "manual");
        insert_entry(&conn, "another secret value", "app");

        let pattern = "%secret%";
        let mut stmt = conn
            .prepare(
                "SELECT id, content, source, created_at
                 FROM clipboard_history WHERE content LIKE ?1
                 ORDER BY created_at DESC",
            )
            .unwrap();
        let results: Vec<super::ClipboardEntry> = stmt
            .query_map(params![pattern], |row| {
                Ok(super::ClipboardEntry {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    source: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(results.len(), 2);
        for r in &results {
            assert!(r.content.contains("secret"));
        }
    }

    #[test]
    fn test_clipboard_clear() {
        let conn = init_test_db();
        insert_entry(&conn, "one", "a");
        insert_entry(&conn, "two", "b");

        conn.execute("DELETE FROM clipboard_history", []).unwrap();

        let entries = list_entries(&conn, 50);
        assert!(entries.is_empty());
    }

    #[test]
    fn test_clipboard_multiple_sources() {
        let conn = init_test_db();
        insert_entry(&conn, "from vscode", "vscode");
        insert_entry(&conn, "from browser", "browser");
        insert_entry(&conn, "from terminal", "terminal");

        let entries = list_entries(&conn, 50);
        assert_eq!(entries.len(), 3);
    }
}
