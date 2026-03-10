use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct ContainerStats {
    pub container_id: String,
    pub name: String,
    pub cpu_percent: f64,
    pub mem_usage: String,
    pub mem_percent: f64,
    pub net_io: String,
}

/// Get resource usage stats for all running containers.
#[tauri::command]
pub async fn get_container_stats() -> Result<Vec<ContainerStats>, String> {
    let output = Command::new("docker")
        .args([
            "stats",
            "--no-stream",
            "--format",
            "{{.ID}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}",
        ])
        .output()
        .map_err(|e| format!("Run docker stats: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker stats failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut stats = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(6, '\t').collect();
        if parts.len() >= 6 {
            let cpu_str = parts[2].trim_end_matches('%');
            let cpu_percent = cpu_str.parse::<f64>().unwrap_or(0.0);

            let mem_pct_str = parts[4].trim_end_matches('%');
            let mem_percent = mem_pct_str.parse::<f64>().unwrap_or(0.0);

            stats.push(ContainerStats {
                container_id: parts[0].to_string(),
                name: parts[1].to_string(),
                cpu_percent,
                mem_usage: parts[3].to_string(),
                mem_percent,
                net_io: parts[5].to_string(),
            });
        }
    }

    Ok(stats)
}

/// Get recent logs from a container.
#[tauri::command]
pub async fn get_container_logs(container_id: String, tail: Option<u32>) -> Result<String, String> {
    let tail_str = tail.unwrap_or(100).to_string();
    let output = Command::new("docker")
        .args(["logs", "--tail", &tail_str, &container_id])
        .output()
        .map_err(|e| format!("Run docker logs: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker logs failed: {}", stderr));
    }

    // Docker logs can write to both stdout and stderr
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let mut combined = stdout.into_owned();
    if !stderr.is_empty() {
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(&stderr);
    }

    Ok(combined)
}

/// Perform an action on a container: start, stop, restart, or remove.
#[tauri::command]
pub async fn container_action(container_id: String, action: String) -> Result<(), String> {
    let cmd = match action.as_str() {
        "start" | "stop" | "restart" => action.as_str(),
        "remove" => "rm",
        _ => {
            return Err(format!(
                "Invalid action: {}. Use start|stop|restart|remove",
                action
            ))
        }
    };

    let mut args = vec![cmd];

    // Force remove if requested
    if cmd == "rm" {
        args.push("-f");
    }

    args.push(&container_id);

    let output = Command::new("docker")
        .args(&args)
        .output()
        .map_err(|e| format!("Run docker {}: {}", cmd, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker {} failed: {}", cmd, stderr));
    }

    Ok(())
}
