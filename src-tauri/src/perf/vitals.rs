use crate::db::AppDb;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
pub struct WebVitalsReport {
    pub url: String,
    pub performance_score: Option<f64>,
    pub fcp_ms: Option<f64>,
    pub lcp_ms: Option<f64>,
    pub cls: Option<f64>,
    pub tbt_ms: Option<f64>,
    pub ttfb_ms: Option<f64>,
    pub speed_index_ms: Option<f64>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct VitalsHistory {
    pub id: i64,
    pub url: String,
    pub performance_score: f64,
    pub created_at: String,
}

/// Run a Lighthouse audit against the given URL.
///
/// First tries `npx lighthouse` with headless Chrome. If that is unavailable,
/// falls back to a simple HTTP GET and measures TTFB.
#[tauri::command]
pub async fn run_lighthouse_audit(
    http: tauri::State<'_, crate::HttpClient>,
    url: String,
) -> Result<WebVitalsReport, String> {
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    // Try running lighthouse via npx
    let output = tokio::process::Command::new("npx")
        .args([
            "lighthouse",
            &url,
            "--output=json",
            "--quiet",
            "--chrome-flags=--headless",
        ])
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let json: serde_json::Value =
                serde_json::from_str(&stdout).map_err(|e| format!("Parse lighthouse JSON: {e}"))?;

            let categories = &json["categories"];
            let performance_score = categories["performance"]["score"]
                .as_f64()
                .map(|s| s * 100.0);

            let audits = &json["audits"];
            let fcp_ms = audits["first-contentful-paint"]["numericValue"].as_f64();
            let lcp_ms = audits["largest-contentful-paint"]["numericValue"].as_f64();
            let cls = audits["cumulative-layout-shift"]["numericValue"].as_f64();
            let tbt_ms = audits["total-blocking-time"]["numericValue"].as_f64();
            let ttfb_ms = audits["server-response-time"]["numericValue"].as_f64();
            let speed_index_ms = audits["speed-index"]["numericValue"].as_f64();

            Ok(WebVitalsReport {
                url,
                performance_score,
                fcp_ms,
                lcp_ms,
                cls,
                tbt_ms,
                ttfb_ms,
                speed_index_ms,
                created_at: now,
            })
        }
        _ => {
            // Fallback: measure TTFB with a simple GET request
            let start = std::time::Instant::now();
            let resp = http
                .0
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("HTTP request failed: {e}"))?;
            let ttfb = start.elapsed().as_secs_f64() * 1000.0;

            let _status = resp.status();

            Ok(WebVitalsReport {
                url,
                performance_score: None,
                fcp_ms: None,
                lcp_ms: None,
                cls: None,
                tbt_ms: None,
                ttfb_ms: Some(ttfb),
                speed_index_ms: None,
                created_at: now,
            })
        }
    }
}

/// Persist a web-vitals measurement to the database.
#[tauri::command]
pub fn record_vitals(
    db: State<'_, AppDb>,
    url: String,
    performance_score: Option<f64>,
    fcp_ms: Option<f64>,
    lcp_ms: Option<f64>,
    cls: Option<f64>,
    tbt_ms: Option<f64>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO web_vitals (url, performance_score, fcp_ms, lcp_ms, cls, tbt_ms) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![url, performance_score, fcp_ms, lcp_ms, cls, tbt_ms],
    )
    .map_err(|e| format!("Insert vitals: {e}"))?;

    Ok(conn.last_insert_rowid())
}

/// Return the most recent vitals measurements for a URL.
#[tauri::command]
pub fn get_vitals_history(
    db: State<'_, AppDb>,
    url: String,
    limit: Option<i64>,
) -> Result<Vec<VitalsHistory>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let limit = limit.unwrap_or(20);

    let mut stmt = conn
        .prepare(
            "SELECT id, url, performance_score, created_at FROM web_vitals \
             WHERE url = ?1 ORDER BY created_at DESC LIMIT ?2",
        )
        .map_err(|e| format!("Prepare: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![url, limit], |row| {
            Ok(VitalsHistory {
                id: row.get(0)?,
                url: row.get(1)?,
                performance_score: row.get::<_, f64>(2).unwrap_or(0.0),
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query: {e}"))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {e}"))?);
    }
    Ok(results)
}

/// Delete all vitals history for a given URL.
#[tauri::command]
pub fn clear_vitals_history(db: State<'_, AppDb>, url: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "DELETE FROM web_vitals WHERE url = ?1",
        rusqlite::params![url],
    )
    .map_err(|e| format!("Delete vitals: {e}"))?;
    Ok(())
}
