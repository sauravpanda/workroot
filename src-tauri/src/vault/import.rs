use crate::db::queries;
use crate::db::AppDb;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

use super::crypto;

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedEnvVar {
    pub key: String,
    pub value: String,
    pub line: usize,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
}

/// Parses a .env file and returns all key-value pairs.
/// Handles comments, blank lines, quoted values, multiline quotes, and `export` prefix.
pub fn parse_env_content(content: &str) -> Result<Vec<ParsedEnvVar>, String> {
    let mut vars = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();
        let line_num = i + 1;
        i += 1;

        // Skip empty lines and comments
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Strip optional `export ` prefix
        let line = line.strip_prefix("export ").unwrap_or(line);

        // Find the '=' separator
        let Some(eq_pos) = line.find('=') else {
            continue;
        };

        let key = line[..eq_pos].trim().to_string();
        if key.is_empty() {
            continue;
        }

        let raw_value = line[eq_pos + 1..].trim();

        // Handle quoted values (may span multiple lines)
        let value = if raw_value.starts_with('"') {
            parse_double_quoted(raw_value, &lines, &mut i)?
        } else if raw_value.starts_with('\'') {
            parse_single_quoted(raw_value, &lines, &mut i)?
        } else {
            // Unquoted: strip inline comments
            raw_value
                .split(" #")
                .next()
                .unwrap_or(raw_value)
                .trim()
                .to_string()
        };

        vars.push(ParsedEnvVar {
            key,
            value,
            line: line_num,
        });
    }

    Ok(vars)
}

fn parse_double_quoted(first_part: &str, lines: &[&str], i: &mut usize) -> Result<String, String> {
    // Remove leading quote
    let mut content = first_part[1..].to_string();

    // Check if closing quote is on the same line
    if let Some(end) = content.find('"') {
        return Ok(content[..end].to_string());
    }

    // Multiline: keep reading until closing quote
    while *i < lines.len() {
        content.push('\n');
        let line = lines[*i];
        *i += 1;
        if let Some(end) = line.find('"') {
            content.push_str(&line[..end]);
            return Ok(content);
        }
        content.push_str(line);
    }

    Err("Unterminated double-quoted value".into())
}

fn parse_single_quoted(first_part: &str, lines: &[&str], i: &mut usize) -> Result<String, String> {
    let mut content = first_part[1..].to_string();

    if let Some(end) = content.find('\'') {
        return Ok(content[..end].to_string());
    }

    while *i < lines.len() {
        content.push('\n');
        let line = lines[*i];
        *i += 1;
        if let Some(end) = line.find('\'') {
            content.push_str(&line[..end]);
            return Ok(content);
        }
        content.push_str(line);
    }

    Err("Unterminated single-quoted value".into())
}

/// Parses a .env file on disk and returns the key-value pairs.
#[tauri::command]
pub fn parse_env_file(path: String) -> Result<Vec<ParsedEnvVar>, String> {
    let content = std::fs::read_to_string(Path::new(&path))
        .map_err(|e| format!("Cannot read file: {}", e))?;
    parse_env_content(&content)
}

/// Imports parsed env vars into a profile, encrypting each value.
/// `on_conflict`: "skip" or "overwrite".
#[tauri::command]
pub fn import_env_vars(
    db: State<'_, AppDb>,
    profile_id: i64,
    vars: Vec<ParsedEnvVar>,
    on_conflict: String,
) -> Result<ImportResult, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Get existing keys
    let existing =
        queries::list_env_var_keys(&conn, profile_id).map_err(|e| format!("DB error: {}", e))?;
    let existing_keys: std::collections::HashSet<String> =
        existing.iter().map(|v| v.key.clone()).collect();

    let mut imported = 0;
    let mut skipped = 0;

    for var in vars {
        if existing_keys.contains(&var.key) {
            if on_conflict == "skip" {
                skipped += 1;
                continue;
            }
            // overwrite: delete existing, then insert new
            if let Some(existing_var) = existing.iter().find(|v| v.key == var.key) {
                let _ = queries::delete_env_var(&conn, existing_var.id);
            }
        }

        let encrypted = crypto::encrypt(&var.value)?;
        queries::insert_env_var(&conn, profile_id, &var.key, Some(&encrypted))
            .map_err(|e| format!("Failed to import {}: {}", var.key, e))?;
        imported += 1;
    }

    Ok(ImportResult { imported, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basic() {
        let content = "KEY=value\nDB_URL=postgres://localhost/db";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars.len(), 2);
        assert_eq!(vars[0].key, "KEY");
        assert_eq!(vars[0].value, "value");
        assert_eq!(vars[1].key, "DB_URL");
        assert_eq!(vars[1].value, "postgres://localhost/db");
    }

    #[test]
    fn parse_comments_and_blanks() {
        let content = "# comment\n\nKEY=value\n  # another comment\nKEY2=val2";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars.len(), 2);
    }

    #[test]
    fn parse_export_prefix() {
        let content = "export API_KEY=abc123\nexport DB=test";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars.len(), 2);
        assert_eq!(vars[0].key, "API_KEY");
        assert_eq!(vars[0].value, "abc123");
    }

    #[test]
    fn parse_double_quoted() {
        let content = "KEY=\"value with spaces\"";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars[0].value, "value with spaces");
    }

    #[test]
    fn parse_single_quoted() {
        let content = "KEY='literal $value'";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars[0].value, "literal $value");
    }

    #[test]
    fn parse_multiline_double_quoted() {
        let content = "KEY=\"line1\nline2\nline3\"";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars[0].value, "line1\nline2\nline3");
    }

    #[test]
    fn parse_inline_comment() {
        let content = "KEY=value # this is a comment";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars[0].value, "value");
    }

    #[test]
    fn parse_empty_value() {
        let content = "KEY=";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars[0].value, "");
    }

    #[test]
    fn parse_line_numbers() {
        let content = "# comment\nKEY1=a\n\nKEY2=b";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars[0].line, 2);
        assert_eq!(vars[1].line, 4);
    }
}
