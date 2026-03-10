use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct LicenseInfo {
    pub package: String,
    pub version: String,
    pub license: String,
    pub category: String,
}

/// Check licenses of all npm dependencies in a project.
#[tauri::command]
pub async fn check_licenses(cwd: String) -> Result<Vec<LicenseInfo>, String> {
    let path = Path::new(&cwd);
    let node_modules = path.join("node_modules");

    if !node_modules.exists() {
        return Ok(Vec::new());
    }

    // Read the top-level package.json for dependency names
    let pkg_json_path = path.join("package.json");
    let pkg_content =
        std::fs::read_to_string(&pkg_json_path).map_err(|e| format!("Read package.json: {}", e))?;
    let pkg: serde_json::Value =
        serde_json::from_str(&pkg_content).map_err(|e| format!("Parse package.json: {}", e))?;

    let mut dep_names: Vec<String> = Vec::new();

    for key in &["dependencies", "devDependencies"] {
        if let Some(deps) = pkg.get(*key).and_then(|d| d.as_object()) {
            for name in deps.keys() {
                dep_names.push(name.clone());
            }
        }
    }

    let mut results = Vec::new();

    for dep_name in &dep_names {
        let dep_pkg_path = node_modules.join(dep_name).join("package.json");
        if !dep_pkg_path.exists() {
            continue;
        }

        let dep_content = match std::fs::read_to_string(&dep_pkg_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let dep_pkg: serde_json::Value = match serde_json::from_str(&dep_content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let version = dep_pkg
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let license = dep_pkg
            .get("license")
            .and_then(|l| l.as_str())
            .unwrap_or("unknown")
            .to_string();

        let category = categorize_license(&license);

        results.push(LicenseInfo {
            package: dep_name.clone(),
            version,
            license,
            category,
        });
    }

    Ok(results)
}

fn categorize_license(license: &str) -> String {
    let upper = license.to_uppercase();
    if upper.contains("MIT")
        || upper.contains("APACHE")
        || upper.contains("BSD")
        || upper.contains("ISC")
        || upper.contains("UNLICENSE")
        || upper.contains("CC0")
    {
        "permissive".to_string()
    } else if upper.contains("GPL") || upper.contains("AGPL") || upper.contains("LGPL") {
        "copyleft".to_string()
    } else if upper.contains("MPL") {
        "weak-copyleft".to_string()
    } else if upper == "UNKNOWN" || upper.is_empty() {
        "unknown".to_string()
    } else {
        "other".to_string()
    }
}
