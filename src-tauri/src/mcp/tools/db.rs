use crate::dbconnect::detect;
use crate::dbconnect::schema::{self, SchemaCache};
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// MCP tool: get full database schema overview.
pub fn get_db_schema(app: &AppHandle, worktree_id: i64) -> Result<Value, String> {
    let config = detect::detect_database(app, worktree_id)?;
    let config = match config {
        Some(c) => c,
        None => {
            return Ok(serde_json::json!({
                "connected": false,
                "message": "No database detected for this worktree"
            }))
        }
    };

    let cache = app.state::<SchemaCache>();
    let cache_key = format!("{}:{}", worktree_id, config.url);

    let schema_info = if let Some(cached) = cache.get(&cache_key) {
        cached
    } else {
        let info = schema::introspect_schema(&config)?;
        cache.set(cache_key, info.clone());
        info
    };

    // Return summary: table names, column counts, row counts
    let tables: Vec<Value> = schema_info
        .tables
        .iter()
        .map(|t| {
            serde_json::json!({
                "name": t.name,
                "column_count": t.columns.len(),
                "row_count": t.row_count,
                "has_foreign_keys": !t.foreign_keys.is_empty(),
            })
        })
        .collect();

    Ok(serde_json::json!({
        "connected": true,
        "db_type": schema_info.db_type,
        "table_count": tables.len(),
        "tables": tables,
    }))
}

/// MCP tool: get detailed info for a specific table.
pub fn get_table_details(
    app: &AppHandle,
    worktree_id: i64,
    table_name: &str,
) -> Result<Value, String> {
    let config = detect::detect_database(app, worktree_id)?;
    let config = match config {
        Some(c) => c,
        None => return Err("No database detected".into()),
    };

    let cache = app.state::<SchemaCache>();
    let cache_key = format!("{}:{}", worktree_id, config.url);

    let schema_info = if let Some(cached) = cache.get(&cache_key) {
        cached
    } else {
        let info = schema::introspect_schema(&config)?;
        cache.set(cache_key, info.clone());
        info
    };

    let table = schema_info
        .tables
        .iter()
        .find(|t| t.name == table_name)
        .ok_or_else(|| format!("Table not found: {}", table_name))?;

    serde_json::to_value(table).map_err(|e| format!("Serialize: {}", e))
}

/// MCP tool: get foreign key relationships across all tables.
pub fn get_db_relationships(app: &AppHandle, worktree_id: i64) -> Result<Value, String> {
    let config = detect::detect_database(app, worktree_id)?;
    let config = match config {
        Some(c) => c,
        None => return Err("No database detected".into()),
    };

    let cache = app.state::<SchemaCache>();
    let cache_key = format!("{}:{}", worktree_id, config.url);

    let schema_info = if let Some(cached) = cache.get(&cache_key) {
        cached
    } else {
        let info = schema::introspect_schema(&config)?;
        cache.set(cache_key, info.clone());
        info
    };

    let relationships: Vec<Value> = schema_info
        .tables
        .iter()
        .flat_map(|t| {
            t.foreign_keys.iter().map(move |fk| {
                serde_json::json!({
                    "from_table": t.name,
                    "from_column": fk.column,
                    "to_table": fk.references_table,
                    "to_column": fk.references_column,
                })
            })
        })
        .collect();

    Ok(serde_json::json!({
        "db_type": schema_info.db_type,
        "relationships": relationships,
    }))
}
