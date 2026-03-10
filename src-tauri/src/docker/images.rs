use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created: String,
}

/// List all local Docker images.
#[tauri::command]
pub async fn list_docker_images() -> Result<Vec<DockerImage>, String> {
    let output = Command::new("docker")
        .args([
            "images",
            "--format",
            "{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}",
        ])
        .output()
        .map_err(|e| format!("Run docker images: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker images failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut images = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(5, '\t').collect();
        if parts.len() >= 5 {
            images.push(DockerImage {
                id: parts[0].to_string(),
                repository: parts[1].to_string(),
                tag: parts[2].to_string(),
                size: parts[3].to_string(),
                created: parts[4].to_string(),
            });
        }
    }

    Ok(images)
}

/// Remove a Docker image by ID.
#[tauri::command]
pub async fn remove_docker_image(image_id: String) -> Result<(), String> {
    let output = Command::new("docker")
        .args(["rmi", &image_id])
        .output()
        .map_err(|e| format!("Run docker rmi: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker rmi failed: {}", stderr));
    }

    Ok(())
}

/// Prune unused Docker images. Returns the space reclaimed message.
#[tauri::command]
pub async fn prune_docker_images() -> Result<String, String> {
    let output = Command::new("docker")
        .args(["image", "prune", "-f"])
        .output()
        .map_err(|e| format!("Run docker image prune: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker image prune failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim().to_string())
}
