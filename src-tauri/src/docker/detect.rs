use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub ports: String,
}

/// Check whether Docker is available on the system.
#[tauri::command]
pub async fn detect_docker() -> Result<bool, String> {
    let output = Command::new("docker")
        .args(["info", "--format", "{{.ServerVersion}}"])
        .output();

    match output {
        Ok(o) => Ok(o.status.success()),
        Err(_) => Ok(false),
    }
}

/// List running Docker containers.
#[tauri::command]
pub async fn list_containers() -> Result<Vec<ContainerInfo>, String> {
    let output = Command::new("docker")
        .args([
            "ps",
            "--format",
            "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}",
        ])
        .output()
        .map_err(|e| format!("Run docker ps: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker ps failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut containers = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(5, '\t').collect();
        if parts.len() >= 4 {
            containers.push(ContainerInfo {
                id: parts[0].to_string(),
                name: parts[1].to_string(),
                image: parts[2].to_string(),
                status: parts[3].to_string(),
                ports: parts.get(4).unwrap_or(&"").to_string(),
            });
        }
    }

    Ok(containers)
}
