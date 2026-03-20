use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;

#[derive(Debug, Serialize, Clone)]
pub struct PortInfo {
    pub port: u16,
    pub status: String,
    pub service: Option<String>,
}

/// Scan a list of local ports and report which are open.
#[tauri::command]
pub async fn scan_local_ports(ports: Vec<u16>) -> Result<Vec<PortInfo>, String> {
    let known_services: HashMap<u16, &str> = HashMap::from([
        (3000, "dev server"),
        (3001, "dev server"),
        (4000, "dev server"),
        (5173, "vite"),
        (5174, "vite"),
        (8080, "http-alt"),
        (8888, "forward proxy"),
        (9999, "webhooks"),
        (5432, "postgres"),
        (3306, "mysql"),
        (6379, "redis"),
        (27017, "mongodb"),
        (11434, "ollama"),
    ]);

    let mut handles = Vec::new();

    for port in ports {
        let service_name = known_services.get(&port).map(|s| s.to_string());
        handles.push(tokio::spawn(async move {
            let addr = format!("127.0.0.1:{port}");
            let result = tokio::time::timeout(
                Duration::from_millis(500),
                tokio::net::TcpStream::connect(&addr),
            )
            .await;

            let status = match result {
                Ok(Ok(_)) => "open".to_string(),
                _ => "closed".to_string(),
            };

            PortInfo {
                port,
                status: status.clone(),
                service: if status == "open" { service_name } else { None },
            }
        }));
    }

    let mut results = Vec::new();
    for handle in handles {
        let info = handle.await.map_err(|e| format!("Join error: {e}"))?;
        results.push(info);
    }

    Ok(results)
}
