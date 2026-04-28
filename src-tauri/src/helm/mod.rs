//! Helm-daemon machine registry.
//!
//! Each row in `helm_machines` is one daemon endpoint the user has paired
//! with workroot. The daemons are oblivious to each other — this module is
//! the only place the multi-machine list lives, mirroring helm's
//! `app/lib/machines.ts`.
//!
//! Bearer tokens are kept in the OS keyring under
//! `service = "com.workroot.app"`, `user = "helm-token-<id>"`. They never
//! touch the SQLite row.

use crate::db::queries::{self, HelmMachineRow};
use crate::db::AppDb;
use keyring::Entry;
use serde::Serialize;
use tauri::State;

const KEYRING_SERVICE: &str = "com.workroot.app";

fn token_user(machine_id: i64) -> String {
    format!("helm-token-{}", machine_id)
}

fn keyring_entry(machine_id: i64) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, &token_user(machine_id))
        .map_err(|e| format!("Keyring entry: {}", e))
}

fn read_token(machine_id: i64) -> Result<Option<String>, String> {
    let entry = keyring_entry(machine_id)?;
    match entry.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keyring read: {}", e)),
    }
}

fn write_token(machine_id: i64, token: Option<&str>) -> Result<(), String> {
    let entry = keyring_entry(machine_id)?;
    match token {
        Some(t) if !t.is_empty() => entry
            .set_password(t)
            .map_err(|e| format!("Keyring write: {}", e)),
        _ => match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Keyring clear: {}", e)),
        },
    }
}

/// Machine record returned to the frontend. The bearer token is included
/// when present; React assembles `Authorization: Bearer <token>` headers
/// directly. Tauri's IPC boundary already isolates this from the open web.
#[derive(Debug, Serialize)]
pub struct HelmMachine {
    #[serde(flatten)]
    row: HelmMachineRow,
    api_token: Option<String>,
}

fn hydrate(row: HelmMachineRow) -> Result<HelmMachine, String> {
    let api_token = read_token(row.id)?;
    Ok(HelmMachine { row, api_token })
}

#[tauri::command]
pub fn list_helm_machines(db: State<'_, AppDb>) -> Result<Vec<HelmMachine>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let rows =
        queries::list_helm_machines(&conn).map_err(|e| format!("List helm machines: {}", e))?;
    rows.into_iter().map(hydrate).collect()
}

#[tauri::command]
pub fn add_helm_machine(
    db: State<'_, AppDb>,
    label: String,
    base_url: String,
    api_token: Option<String>,
) -> Result<HelmMachine, String> {
    let label = label.trim().to_string();
    let base_url = normalize_base_url(&base_url);
    if label.is_empty() {
        return Err("Label is required".into());
    }
    if base_url.is_empty() {
        return Err("Base URL is required".into());
    }

    let id = {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
        queries::insert_helm_machine(&conn, &label, &base_url)
            .map_err(|e| format!("Insert helm machine: {}", e))?
    };

    if let Some(ref t) = api_token {
        write_token(id, Some(t))?;
    }

    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let row = queries::get_helm_machine(&conn, id)
        .map_err(|e| format!("Get helm machine: {}", e))?
        .ok_or_else(|| "Machine vanished after insert".to_string())?;
    drop(conn);
    hydrate(row)
}

#[tauri::command]
pub fn update_helm_machine(
    db: State<'_, AppDb>,
    id: i64,
    label: String,
    base_url: String,
    enabled: bool,
    api_token: Option<String>,
    clear_token: Option<bool>,
) -> Result<HelmMachine, String> {
    let label = label.trim().to_string();
    let base_url = normalize_base_url(&base_url);
    if label.is_empty() {
        return Err("Label is required".into());
    }
    if base_url.is_empty() {
        return Err("Base URL is required".into());
    }

    {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
        let updated = queries::update_helm_machine(&conn, id, &label, &base_url, enabled)
            .map_err(|e| format!("Update helm machine: {}", e))?;
        if !updated {
            return Err(format!("No helm machine with id {}", id));
        }
    }

    if clear_token.unwrap_or(false) {
        write_token(id, None)?;
    } else if let Some(t) = api_token.as_deref() {
        write_token(id, Some(t))?;
    }

    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let row = queries::get_helm_machine(&conn, id)
        .map_err(|e| format!("Get helm machine: {}", e))?
        .ok_or_else(|| "Machine vanished after update".to_string())?;
    drop(conn);
    hydrate(row)
}

#[tauri::command]
pub fn remove_helm_machine(db: State<'_, AppDb>, id: i64) -> Result<bool, String> {
    let removed = {
        let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
        queries::delete_helm_machine(&conn, id)
            .map_err(|e| format!("Delete helm machine: {}", e))?
    };
    if removed {
        let _ = write_token(id, None);
    }
    Ok(removed)
}

#[tauri::command]
pub fn touch_helm_machine_seen(db: State<'_, AppDb>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    queries::touch_helm_machine_last_seen(&conn, id)
        .map_err(|e| format!("Touch helm machine: {}", e))?;
    Ok(())
}

fn normalize_base_url(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/').to_string();
    trimmed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_test_db;

    #[test]
    fn insert_and_list() {
        let conn = init_test_db();
        let id = queries::insert_helm_machine(&conn, "Work MBP", "http://10.0.0.1:8421").unwrap();
        assert!(id > 0);

        let all = queries::list_helm_machines(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].label, "Work MBP");
        assert_eq!(all[0].base_url, "http://10.0.0.1:8421");
        assert!(all[0].enabled);
        assert!(all[0].last_seen_at.is_none());
    }

    #[test]
    fn update_changes_fields() {
        let conn = init_test_db();
        let id = queries::insert_helm_machine(&conn, "Work", "http://10.0.0.1:8421").unwrap();

        queries::update_helm_machine(&conn, id, "Work MBP", "http://10.0.0.2:8421", false).unwrap();

        let m = queries::get_helm_machine(&conn, id).unwrap().unwrap();
        assert_eq!(m.label, "Work MBP");
        assert_eq!(m.base_url, "http://10.0.0.2:8421");
        assert!(!m.enabled);
    }

    #[test]
    fn delete_removes_row() {
        let conn = init_test_db();
        let id = queries::insert_helm_machine(&conn, "Work", "http://10.0.0.1:8421").unwrap();

        let removed = queries::delete_helm_machine(&conn, id).unwrap();
        assert!(removed);
        assert!(queries::list_helm_machines(&conn).unwrap().is_empty());
    }

    #[test]
    fn touch_last_seen_updates_timestamp() {
        let conn = init_test_db();
        let id = queries::insert_helm_machine(&conn, "Work", "http://10.0.0.1:8421").unwrap();

        queries::touch_helm_machine_last_seen(&conn, id).unwrap();
        let m = queries::get_helm_machine(&conn, id).unwrap().unwrap();
        assert!(m.last_seen_at.is_some());
    }

    #[test]
    fn normalize_base_url_strips_trailing_slash_and_whitespace() {
        assert_eq!(normalize_base_url("  http://x:8421/  "), "http://x:8421");
        assert_eq!(normalize_base_url("http://x:8421///"), "http://x:8421");
        assert_eq!(normalize_base_url("http://x:8421"), "http://x:8421");
    }
}
