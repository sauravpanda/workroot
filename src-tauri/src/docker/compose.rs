use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct ComposeService {
    pub name: String,
    pub image: Option<String>,
    pub ports: Vec<String>,
    pub status: String,
}

/// List services defined in a docker-compose file.
#[tauri::command]
pub async fn list_compose_services(cwd: String) -> Result<Vec<ComposeService>, String> {
    let path = Path::new(&cwd);

    // Find the compose file
    let compose_file = [
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml",
    ]
    .iter()
    .map(|f| path.join(f))
    .find(|p| p.exists())
    .ok_or("No docker-compose file found")?;

    let content =
        std::fs::read_to_string(&compose_file).map_err(|e| format!("Read compose file: {}", e))?;

    let parsed: serde_json::Value =
        serde_yaml_to_json(&content).map_err(|e| format!("Parse compose: {}", e))?;

    let mut services = Vec::new();

    if let Some(svc_map) = parsed.get("services").and_then(|s| s.as_object()) {
        for (name, config) in svc_map {
            let image = config
                .get("image")
                .and_then(|i| i.as_str())
                .map(String::from);

            let ports = config
                .get("ports")
                .and_then(|p| p.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| {
                            v.as_str().map(String::from).or_else(|| Some(v.to_string()))
                        })
                        .collect()
                })
                .unwrap_or_default();

            services.push(ComposeService {
                name: name.clone(),
                image,
                ports,
                status: "defined".to_string(),
            });
        }
    }

    // Try to get live status from docker compose ps
    if let Ok(live) = get_compose_status(&cwd) {
        for service in &mut services {
            if let Some(status) = live.get(&service.name) {
                service.status = status.clone();
            }
        }
    }

    Ok(services)
}

/// Minimal YAML parser that handles basic docker-compose structure.
/// Parses a subset of YAML (key: value, lists, nested maps) into serde_json::Value.
fn serde_yaml_to_json(yaml: &str) -> Result<serde_json::Value, String> {
    // Use a simple approach: try parsing the compose file via `docker compose config --format json`
    // Fall back to a very basic manual parse if docker is not available
    let output = std::process::Command::new("docker")
        .args(["compose", "config", "--format", "json"])
        .stdin(std::process::Stdio::piped())
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            return serde_json::from_str(&stdout)
                .map_err(|e| format!("Parse docker compose config output: {}", e));
        }
    }

    // Fallback: basic extraction of service names and images from YAML text
    let mut services = serde_json::Map::new();
    let mut current_service: Option<String> = None;
    let mut in_services = false;
    let mut services_indent = 0;

    for line in yaml.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let indent = line.len() - line.trim_start().len();

        if trimmed == "services:" {
            in_services = true;
            services_indent = indent;
            continue;
        }

        if in_services {
            // A line at services_indent + 2 (or similar) that ends with ':'  is a service name
            if indent > services_indent && trimmed.ends_with(':') && !trimmed.contains(' ') {
                let svc_name = trimmed.trim_end_matches(':').to_string();
                services.insert(svc_name.clone(), serde_json::json!({}));
                current_service = Some(svc_name);
            } else if indent <= services_indent && !trimmed.is_empty() {
                in_services = false;
                current_service = None;
            } else if let Some(ref svc) = current_service {
                // Try to extract image
                if let Some(img) = trimmed.strip_prefix("image:") {
                    let img = img.trim().trim_matches('"').trim_matches('\'');
                    if let Some(entry) = services.get_mut(svc) {
                        if let Some(obj) = entry.as_object_mut() {
                            obj.insert("image".to_string(), serde_json::json!(img));
                        }
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({ "services": services }))
}

fn get_compose_status(cwd: &str) -> Result<std::collections::HashMap<String, String>, String> {
    let output = std::process::Command::new("docker")
        .args(["compose", "ps", "--format", "{{.Service}}\t{{.State}}"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("docker compose ps: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut statuses = std::collections::HashMap::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(2, '\t').collect();
        if parts.len() == 2 {
            statuses.insert(parts[0].to_string(), parts[1].to_string());
        }
    }

    Ok(statuses)
}
