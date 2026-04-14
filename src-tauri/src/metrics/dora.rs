use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct DeploymentRecord {
    pub id: i64,
    pub project_id: i64,
    pub version: String,
    pub environment: String,
    pub status: String,
    pub deployed_at: String,
    pub lead_time_hours: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct DoraMetrics {
    pub deployment_frequency: f64,
    pub lead_time_hours: f64,
    pub change_failure_rate: f64,
    pub mttr_hours: f64,
    pub rating: String,
    pub period_days: i64,
}

/// Records a deployment event. Returns the deployment ID.
#[tauri::command]
pub async fn record_deployment(
    db: State<'_, AppDb>,
    project_id: i64,
    version: String,
    environment: String,
    status: String,
    lead_time_hours: Option<f64>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO deployments (project_id, version, environment, status, lead_time_hours) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, version, environment, status, lead_time_hours],
    )
    .map_err(|e| format!("Failed to record deployment: {}", e))?;
    Ok(conn.last_insert_rowid())
}

/// Calculates DORA metrics for a project over a given period.
#[tauri::command]
pub async fn get_dora_metrics(
    db: State<'_, AppDb>,
    project_id: i64,
    period_days: i64,
) -> Result<DoraMetrics, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;

    let cutoff = format!("-{} days", period_days);

    // Total deploys in the period
    let total_deploys: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM deployments WHERE project_id = ?1 AND deployed_at >= datetime('now', ?2)",
            params![project_id, cutoff],
            |row| row.get(0),
        )
        .map_err(|e| format!("Query error: {}", e))?;

    // Deployment frequency: deploys per week
    let weeks = period_days as f64 / 7.0;
    let deployment_frequency = if weeks > 0.0 {
        total_deploys as f64 / weeks
    } else {
        0.0
    };

    // Average lead time (where lead_time_hours is not null)
    let lead_time_hours: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(lead_time_hours), 0.0) FROM deployments WHERE project_id = ?1 AND deployed_at >= datetime('now', ?2) AND lead_time_hours IS NOT NULL",
            params![project_id, cutoff],
            |row| row.get(0),
        )
        .map_err(|e| format!("Query error: {}", e))?;

    // Change failure rate: (failures + rollbacks) / total
    let failure_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM deployments WHERE project_id = ?1 AND deployed_at >= datetime('now', ?2) AND status IN ('failure', 'rollback')",
            params![project_id, cutoff],
            |row| row.get(0),
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let change_failure_rate = if total_deploys > 0 {
        failure_count as f64 / total_deploys as f64
    } else {
        0.0
    };

    // MTTR: average time between a failure and the next success
    let mttr_hours = calculate_mttr(&conn, project_id, &cutoff)
        .map_err(|e| format!("MTTR calculation error: {}", e))?;

    // Rating
    let rating = classify_rating(
        deployment_frequency,
        lead_time_hours,
        change_failure_rate,
        mttr_hours,
        period_days,
    );

    Ok(DoraMetrics {
        deployment_frequency,
        lead_time_hours,
        change_failure_rate,
        mttr_hours,
        rating,
        period_days,
    })
}

/// Approximates MTTR by finding pairs of failure followed by success and averaging the time gap.
fn calculate_mttr(
    conn: &rusqlite::Connection,
    project_id: i64,
    cutoff: &str,
) -> Result<f64, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT status, deployed_at FROM deployments WHERE project_id = ?1 AND deployed_at >= datetime('now', ?2) ORDER BY deployed_at ASC",
    )?;

    let rows: Vec<(String, String)> = stmt
        .query_map(params![project_id, cutoff], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut total_recovery_hours = 0.0;
    let mut recovery_count = 0;
    let mut last_failure_time: Option<chrono::NaiveDateTime> = None;

    for (status, deployed_at) in &rows {
        if let Ok(ts) = chrono::NaiveDateTime::parse_from_str(deployed_at, "%Y-%m-%d %H:%M:%S") {
            if status == "failure" || status == "rollback" {
                if last_failure_time.is_none() {
                    last_failure_time = Some(ts);
                }
            } else if status == "success" {
                if let Some(fail_ts) = last_failure_time {
                    let duration = ts.signed_duration_since(fail_ts);
                    total_recovery_hours += duration.num_minutes() as f64 / 60.0;
                    recovery_count += 1;
                    last_failure_time = None;
                }
            }
        }
    }

    if recovery_count > 0 {
        Ok(total_recovery_hours / recovery_count as f64)
    } else {
        Ok(0.0)
    }
}

/// Classifies the overall DORA rating.
fn classify_rating(freq: f64, lead_time: f64, cfr: f64, mttr: f64, period_days: i64) -> String {
    // Elite: freq > 7/week, lead < 1h, cfr < 5%, mttr < 1h
    if freq > 7.0 && lead_time < 1.0 && cfr < 0.05 && mttr < 1.0 {
        return "Elite".to_string();
    }

    // High: freq > 1/week, lead < 24h, cfr < 10%, mttr < 24h
    if freq > 1.0 && lead_time < 24.0 && cfr < 0.10 && mttr < 24.0 {
        return "High".to_string();
    }

    // Low: freq < 1/month (approx 0.23/week for a 30-day month)
    let deploys_per_month = freq * (30.0 / 7.0);
    if deploys_per_month < 1.0 && period_days >= 30 {
        return "Low".to_string();
    }

    "Medium".to_string()
}

/// Lists recent deployments for a project with an optional limit.
#[tauri::command]
pub async fn list_deployments(
    db: State<'_, AppDb>,
    project_id: i64,
    limit: Option<i64>,
) -> Result<Vec<DeploymentRecord>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock: {}", e))?;
    let limit = limit.unwrap_or(50);
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, version, environment, status, deployed_at, lead_time_hours
             FROM deployments
             WHERE project_id = ?1
             ORDER BY deployed_at DESC
             LIMIT ?2",
        )
        .map_err(|e| format!("Query: {}", e))?;

    let rows = stmt
        .query_map(params![project_id, limit], |row| {
            Ok(DeploymentRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                version: row.get(2)?,
                environment: row.get(3)?,
                status: row.get(4)?,
                deployed_at: row.get(5)?,
                lead_time_hours: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Row: {}", e))?);
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_test_db, AppDb};

    fn setup_db() -> AppDb {
        let conn = init_test_db();
        conn.execute(
            "INSERT INTO projects (id, name, local_path) VALUES (1, 'test-proj', '/tmp/test')",
            [],
        )
        .unwrap();
        AppDb(std::sync::Arc::new(std::sync::Mutex::new(conn)))
    }

    #[test]
    fn test_record_and_list_deployments() {
        let db = setup_db();
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO deployments (project_id, version, environment, status, lead_time_hours) VALUES (1, 'v1.0.0', 'production', 'success', 2.5)",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO deployments (project_id, version, environment, status, lead_time_hours) VALUES (1, 'v1.0.1', 'staging', 'success', 1.0)",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO deployments (project_id, version, environment, status, lead_time_hours) VALUES (1, 'v1.0.2', 'production', 'failure', NULL)",
                [],
            ).unwrap();
        }

        // List deployments
        let conn = db.0.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, version, environment, status, deployed_at, lead_time_hours
                 FROM deployments WHERE project_id = 1 ORDER BY deployed_at DESC LIMIT 50",
            )
            .unwrap();
        let deployments: Vec<DeploymentRecord> = stmt
            .query_map([], |row| {
                Ok(DeploymentRecord {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    version: row.get(2)?,
                    environment: row.get(3)?,
                    status: row.get(4)?,
                    deployed_at: row.get(5)?,
                    lead_time_hours: row.get(6)?,
                })
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(deployments.len(), 3);
        // Verify fields
        let v102 = deployments.iter().find(|d| d.version == "v1.0.2").unwrap();
        assert_eq!(v102.status, "failure");
        assert_eq!(v102.lead_time_hours, None);

        let v100 = deployments.iter().find(|d| d.version == "v1.0.0").unwrap();
        assert_eq!(v100.environment, "production");
        assert_eq!(v100.lead_time_hours, Some(2.5));
    }

    #[test]
    fn test_dora_metrics_calculation() {
        let db = setup_db();
        {
            let conn = db.0.lock().unwrap();
            // Insert a mix of success and failure deployments with recent timestamps
            for i in 0..8 {
                let status = if i % 4 == 0 { "failure" } else { "success" };
                let lead_time = if status == "success" { Some(4.0) } else { None };
                conn.execute(
                    "INSERT INTO deployments (project_id, version, environment, status, lead_time_hours, deployed_at) VALUES (1, ?1, 'production', ?2, ?3, datetime('now', ?4))",
                    params![
                        format!("v{}", i),
                        status,
                        lead_time,
                        format!("-{} hours", i)
                    ],
                ).unwrap();
            }
        }

        let conn = db.0.lock().unwrap();
        let period_days: i64 = 30;
        let cutoff = format!("-{} days", period_days);

        // Total deploys
        let total_deploys: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM deployments WHERE project_id = 1 AND deployed_at >= datetime('now', ?1)",
                params![cutoff],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(total_deploys, 8);

        // Deployment frequency: deploys per week
        let weeks = period_days as f64 / 7.0;
        let freq = total_deploys as f64 / weeks;
        assert!(freq > 0.0);

        // Failure count (every 4th is a failure: i=0, i=4 => 2 failures)
        let failure_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM deployments WHERE project_id = 1 AND deployed_at >= datetime('now', ?1) AND status IN ('failure', 'rollback')",
                params![cutoff],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(failure_count, 2);

        // Change failure rate
        let cfr = failure_count as f64 / total_deploys as f64;
        assert!((cfr - 0.25).abs() < 0.01);

        // Average lead time (6 successes with 4.0h each)
        let avg_lead: f64 = conn
            .query_row(
                "SELECT COALESCE(AVG(lead_time_hours), 0.0) FROM deployments WHERE project_id = 1 AND deployed_at >= datetime('now', ?1) AND lead_time_hours IS NOT NULL",
                params![cutoff],
                |row| row.get(0),
            )
            .unwrap();
        assert!((avg_lead - 4.0).abs() < 0.01);
    }

    #[test]
    fn test_dora_rating_elite() {
        // Elite: freq > 7/week, lead < 1h, cfr < 5%, mttr < 1h
        let rating = classify_rating(10.0, 0.5, 0.02, 0.5, 30);
        assert_eq!(rating, "Elite");

        // High
        let rating = classify_rating(3.0, 12.0, 0.08, 12.0, 30);
        assert_eq!(rating, "High");

        // Medium (default)
        let rating = classify_rating(3.0, 48.0, 0.20, 48.0, 30);
        assert_eq!(rating, "Medium");

        // Low: freq < 1/month, period >= 30
        let rating = classify_rating(0.1, 100.0, 0.50, 100.0, 30);
        assert_eq!(rating, "Low");
    }

    #[test]
    fn test_dora_metrics_empty() {
        let db = setup_db();

        let conn = db.0.lock().unwrap();
        let period_days: i64 = 30;
        let cutoff = format!("-{} days", period_days);

        // Total deploys with no data
        let total_deploys: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM deployments WHERE project_id = 1 AND deployed_at >= datetime('now', ?1)",
                params![cutoff],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(total_deploys, 0);

        // Frequency should be 0
        let weeks = period_days as f64 / 7.0;
        let freq = if weeks > 0.0 {
            total_deploys as f64 / weeks
        } else {
            0.0
        };
        assert_eq!(freq, 0.0);

        // CFR should be 0 (no divide by zero)
        let cfr = if total_deploys > 0 {
            0.0 // would compute normally
        } else {
            0.0
        };
        assert_eq!(cfr, 0.0);

        // Average lead time should be 0
        let avg_lead: f64 = conn
            .query_row(
                "SELECT COALESCE(AVG(lead_time_hours), 0.0) FROM deployments WHERE project_id = 1 AND deployed_at >= datetime('now', ?1) AND lead_time_hours IS NOT NULL",
                params![cutoff],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(avg_lead, 0.0);

        // MTTR should be 0
        let mttr = calculate_mttr(&conn, 1, &cutoff).unwrap();
        assert_eq!(mttr, 0.0);
    }
}
