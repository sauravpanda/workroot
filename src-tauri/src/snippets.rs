use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct Snippet {
    pub id: i64,
    pub title: String,
    pub language: String,
    pub content: String,
    pub tags: String,
    pub project_id: Option<i64>,
    pub created_at: String,
}

/// Create a new code snippet.
#[tauri::command]
pub fn create_snippet(
    db: State<'_, AppDb>,
    title: String,
    language: String,
    content: String,
    tags: String,
    project_id: Option<i64>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO snippets (title, language, content, tags, project_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![title, language, content, tags, project_id],
    )
    .map_err(|e| format!("DB: {}", e))?;
    Ok(conn.last_insert_rowid())
}

/// List snippets, optionally filtered by project.
#[tauri::command]
pub fn list_snippets(
    db: State<'_, AppDb>,
    project_id: Option<i64>,
) -> Result<Vec<Snippet>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    if let Some(pid) = project_id {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, language, content, tags, project_id, created_at
                 FROM snippets WHERE project_id = ?1 ORDER BY created_at DESC",
            )
            .map_err(|e| format!("DB: {}", e))?;
        let rows = stmt
            .query_map(params![pid], |row| {
                Ok(Snippet {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    language: row.get(2)?,
                    content: row.get(3)?,
                    tags: row.get(4)?,
                    project_id: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("DB: {}", e))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("DB: {}", e))
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, language, content, tags, project_id, created_at
                 FROM snippets ORDER BY created_at DESC",
            )
            .map_err(|e| format!("DB: {}", e))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(Snippet {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    language: row.get(2)?,
                    content: row.get(3)?,
                    tags: row.get(4)?,
                    project_id: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("DB: {}", e))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("DB: {}", e))
    }
}

/// Search snippets by title, content, or tags.
#[tauri::command]
pub fn search_snippets(db: State<'_, AppDb>, query: String) -> Result<Vec<Snippet>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn
        .prepare(
            "SELECT id, title, language, content, tags, project_id, created_at
             FROM snippets
             WHERE title LIKE ?1 OR content LIKE ?1 OR tags LIKE ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| format!("DB: {}", e))?;
    let rows = stmt
        .query_map(params![pattern], |row| {
            Ok(Snippet {
                id: row.get(0)?,
                title: row.get(1)?,
                language: row.get(2)?,
                content: row.get(3)?,
                tags: row.get(4)?,
                project_id: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("DB: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB: {}", e))
}

/// Update an existing snippet.
#[tauri::command]
pub fn update_snippet(
    db: State<'_, AppDb>,
    id: i64,
    title: String,
    language: String,
    content: String,
    tags: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "UPDATE snippets SET title = ?1, language = ?2, content = ?3, tags = ?4 WHERE id = ?5",
        params![title, language, content, tags, id],
    )
    .map_err(|e| format!("DB: {}", e))?;
    Ok(())
}

/// Delete a snippet by ID.
#[tauri::command]
pub fn delete_snippet(db: State<'_, AppDb>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])
        .map_err(|e| format!("DB: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_test_db, AppDb};

    fn setup_db() -> AppDb {
        let conn = init_test_db();
        // Create a project for snippets that reference project_id
        conn.execute(
            "INSERT INTO projects (id, name, local_path) VALUES (1, 'proj-a', '/tmp/a')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, local_path) VALUES (2, 'proj-b', '/tmp/b')",
            [],
        )
        .unwrap();
        AppDb(std::sync::Mutex::new(conn))
    }

    /// Helper: insert a snippet directly via SQL and return its rowid.
    fn insert_snippet(
        db: &AppDb,
        title: &str,
        language: &str,
        content: &str,
        tags: &str,
        project_id: Option<i64>,
    ) -> i64 {
        let conn = db.0.lock().unwrap();
        conn.execute(
            "INSERT INTO snippets (title, language, content, tags, project_id) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![title, language, content, tags, project_id],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn count_snippets(db: &AppDb) -> i64 {
        let conn = db.0.lock().unwrap();
        conn.query_row("SELECT COUNT(*) FROM snippets", [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn test_create_and_list_snippets() {
        let db = setup_db();
        let id1 = insert_snippet(
            &db,
            "Hello World",
            "rust",
            "fn main() {}",
            "intro,rust",
            Some(1),
        );
        let id2 = insert_snippet(
            &db,
            "Fibonacci",
            "python",
            "def fib(n): ...",
            "algo",
            Some(1),
        );

        assert!(id1 > 0);
        assert!(id2 > 0);
        assert_ne!(id1, id2);

        // List all snippets (no project filter)
        let conn = db.0.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, title, language, content, tags, project_id, created_at FROM snippets ORDER BY created_at DESC",
            )
            .unwrap();
        let snippets: Vec<Snippet> = stmt
            .query_map([], |row| {
                Ok(Snippet {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    language: row.get(2)?,
                    content: row.get(3)?,
                    tags: row.get(4)?,
                    project_id: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(snippets.len(), 2);
        // Verify fields of the first returned snippet (most recent = Fibonacci)
        let fib = snippets.iter().find(|s| s.title == "Fibonacci").unwrap();
        assert_eq!(fib.language, "python");
        assert_eq!(fib.content, "def fib(n): ...");
        assert_eq!(fib.tags, "algo");
        assert_eq!(fib.project_id, Some(1));
    }

    #[test]
    fn test_search_snippets() {
        let db = setup_db();
        insert_snippet(
            &db,
            "React Hook",
            "tsx",
            "useEffect(() => {})",
            "react,hook",
            None,
        );
        insert_snippet(
            &db,
            "Rust Iterator",
            "rust",
            "iter().map()",
            "rust,iter",
            None,
        );
        insert_snippet(
            &db,
            "Python Flask",
            "python",
            "app = Flask(__name__)",
            "web",
            None,
        );

        let conn = db.0.lock().unwrap();
        let pattern = "%rust%";
        let mut stmt = conn
            .prepare(
                "SELECT id, title, language, content, tags, project_id, created_at
                 FROM snippets
                 WHERE title LIKE ?1 OR content LIKE ?1 OR tags LIKE ?1
                 ORDER BY created_at DESC",
            )
            .unwrap();
        let results: Vec<Snippet> = stmt
            .query_map(params![pattern], |row| {
                Ok(Snippet {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    language: row.get(2)?,
                    content: row.get(3)?,
                    tags: row.get(4)?,
                    project_id: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        // "Rust Iterator" matches on title and tags; "React Hook" has tag "react,hook" – no rust match
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Rust Iterator");
    }

    #[test]
    fn test_update_snippet() {
        let db = setup_db();
        let id = insert_snippet(&db, "Old Title", "js", "console.log()", "old", None);

        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "UPDATE snippets SET title = ?1, language = ?2, content = ?3, tags = ?4 WHERE id = ?5",
                params!["New Title", "typescript", "console.info()", "new,updated", id],
            )
            .unwrap();
        }

        let conn = db.0.lock().unwrap();
        let (title, language, content, tags): (String, String, String, String) = conn
            .query_row(
                "SELECT title, language, content, tags FROM snippets WHERE id = ?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(title, "New Title");
        assert_eq!(language, "typescript");
        assert_eq!(content, "console.info()");
        assert_eq!(tags, "new,updated");
    }

    #[test]
    fn test_delete_snippet() {
        let db = setup_db();
        let id = insert_snippet(&db, "To Delete", "go", "package main", "delete-me", None);
        assert_eq!(count_snippets(&db), 1);

        {
            let conn = db.0.lock().unwrap();
            conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])
                .unwrap();
        }

        assert_eq!(count_snippets(&db), 0);
    }

    #[test]
    fn test_list_snippets_by_project() {
        let db = setup_db();
        insert_snippet(&db, "Proj A snippet 1", "rust", "code1", "a", Some(1));
        insert_snippet(&db, "Proj A snippet 2", "rust", "code2", "a", Some(1));
        insert_snippet(&db, "Proj B snippet", "python", "code3", "b", Some(2));
        insert_snippet(&db, "No project", "sh", "echo hi", "none", None);

        let conn = db.0.lock().unwrap();

        // List snippets for project 1
        let mut stmt = conn
            .prepare(
                "SELECT id, title, language, content, tags, project_id, created_at
                 FROM snippets WHERE project_id = ?1 ORDER BY created_at DESC",
            )
            .unwrap();
        let proj_a: Vec<Snippet> = stmt
            .query_map(params![1i64], |row| {
                Ok(Snippet {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    language: row.get(2)?,
                    content: row.get(3)?,
                    tags: row.get(4)?,
                    project_id: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(proj_a.len(), 2);
        assert!(proj_a.iter().all(|s| s.project_id == Some(1)));

        // List snippets for project 2
        let proj_b: Vec<Snippet> = stmt
            .query_map(params![2i64], |row| {
                Ok(Snippet {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    language: row.get(2)?,
                    content: row.get(3)?,
                    tags: row.get(4)?,
                    project_id: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(proj_b.len(), 1);
        assert_eq!(proj_b[0].title, "Proj B snippet");
    }
}
