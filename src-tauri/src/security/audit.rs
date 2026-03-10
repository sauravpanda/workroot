use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct Vulnerability {
    pub package: String,
    pub severity: String,
    pub title: String,
    pub url: Option<String>,
    pub fix_version: Option<String>,
}

/// Audit dependencies for known vulnerabilities.
/// Detects the package manager in `cwd` and runs the appropriate audit command.
#[tauri::command]
pub async fn audit_dependencies(cwd: String) -> Result<Vec<Vulnerability>, String> {
    let path = Path::new(&cwd);

    if path.join("package.json").exists() {
        audit_npm(&cwd)
    } else if path.join("Cargo.toml").exists() {
        audit_cargo(&cwd)
    } else {
        Ok(Vec::new())
    }
}

fn audit_npm(cwd: &str) -> Result<Vec<Vulnerability>, String> {
    let output = Command::new("npm")
        .args(["audit", "--json"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Run npm audit: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // npm audit returns non-zero when vulnerabilities exist, so we don't check status
    let parsed: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Parse npm audit: {}", e))?;

    let mut vulns = Vec::new();

    if let Some(advisories) = parsed.get("vulnerabilities").and_then(|v| v.as_object()) {
        for (pkg_name, info) in advisories {
            let severity = info
                .get("severity")
                .and_then(|s| s.as_str())
                .unwrap_or("unknown")
                .to_string();
            let fix_available = info.get("fixAvailable").and_then(|f| {
                if f.is_boolean() {
                    None
                } else {
                    f.get("version").and_then(|v| v.as_str()).map(String::from)
                }
            });

            vulns.push(Vulnerability {
                package: pkg_name.clone(),
                severity,
                title: format!("Vulnerability in {}", pkg_name),
                url: None,
                fix_version: fix_available,
            });
        }
    }

    Ok(vulns)
}

fn audit_cargo(cwd: &str) -> Result<Vec<Vulnerability>, String> {
    let output = Command::new("cargo")
        .args(["audit", "--json"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Run cargo audit: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Parse cargo audit: {}", e))?;

    let mut vulns = Vec::new();

    if let Some(vulnerabilities) = parsed
        .get("vulnerabilities")
        .and_then(|v| v.get("list"))
        .and_then(|l| l.as_array())
    {
        for vuln in vulnerabilities {
            let advisory = vuln.get("advisory");
            let package_name = advisory
                .and_then(|a| a.get("package"))
                .and_then(|p| p.as_str())
                .unwrap_or("unknown")
                .to_string();
            let title = advisory
                .and_then(|a| a.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            let url = advisory
                .and_then(|a| a.get("url"))
                .and_then(|u| u.as_str())
                .map(String::from);

            let fix_version = vuln
                .get("versions")
                .and_then(|v| v.get("patched"))
                .and_then(|p| p.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
                .map(String::from);

            vulns.push(Vulnerability {
                package: package_name,
                severity: "unknown".into(),
                title,
                url,
                fix_version,
            });
        }
    }

    Ok(vulns)
}
