use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct TaskDefinition {
    pub name: String,
    pub command: String,
    pub source: String,
    pub description: Option<String>,
}

/// Discover runnable tasks in the given directory.
///
/// Scans for:
/// - `package.json` scripts
/// - `Makefile` targets
#[tauri::command]
pub fn discover_tasks(path: String) -> Result<Vec<TaskDefinition>, String> {
    let dir = Path::new(&path);
    let mut tasks = Vec::new();

    // package.json
    let pkg_path = dir.join("package.json");
    if pkg_path.exists() {
        match discover_npm_scripts(&pkg_path) {
            Ok(mut t) => tasks.append(&mut t),
            Err(e) => eprintln!("Failed to parse package.json: {}", e),
        }
    }

    // Makefile
    let makefile_path = dir.join("Makefile");
    if makefile_path.exists() {
        match discover_makefile_targets(&makefile_path) {
            Ok(mut t) => tasks.append(&mut t),
            Err(e) => eprintln!("Failed to parse Makefile: {}", e),
        }
    }

    // Cargo.toml (detect cargo commands)
    let cargo_path = dir.join("Cargo.toml");
    if cargo_path.exists() {
        tasks.extend(cargo_tasks());
    }

    Ok(tasks)
}

fn discover_npm_scripts(path: &Path) -> Result<Vec<TaskDefinition>, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let scripts = match json.get("scripts").and_then(|s| s.as_object()) {
        Some(s) => s,
        None => return Ok(Vec::new()),
    };

    // Detect package manager
    let pm = if path
        .parent()
        .is_some_and(|p| p.join("pnpm-lock.yaml").exists())
    {
        "pnpm"
    } else if path.parent().is_some_and(|p| p.join("yarn.lock").exists()) {
        "yarn"
    } else if path.parent().is_some_and(|p| p.join("bun.lockb").exists()) {
        "bun"
    } else {
        "npm"
    };

    let tasks: Vec<TaskDefinition> = scripts
        .iter()
        .map(|(name, value)| {
            let cmd_str = value.as_str().unwrap_or("");
            TaskDefinition {
                name: name.clone(),
                command: format!("{} run {}", pm, name),
                source: "package.json".to_string(),
                description: if cmd_str.len() > 60 {
                    Some(format!("{}...", &cmd_str[..57]))
                } else {
                    Some(cmd_str.to_string())
                },
            }
        })
        .collect();

    Ok(tasks)
}

fn discover_makefile_targets(path: &Path) -> Result<Vec<TaskDefinition>, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;

    let mut targets: Vec<TaskDefinition> = Vec::new();
    let mut comments: HashMap<String, String> = HashMap::new();

    let lines: Vec<&str> = content.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        // Collect comments above targets
        if line.starts_with('#') {
            continue;
        }

        // Match target lines: name: [deps]
        if let Some(colon_pos) = line.find(':') {
            let target_name = line[..colon_pos].trim();

            // Skip special targets and variables
            if target_name.is_empty()
                || target_name.starts_with('.')
                || target_name.starts_with('\t')
                || target_name.contains('=')
                || target_name.contains('$')
                || target_name.contains(' ')
            {
                continue;
            }

            // Grab preceding comment as description
            if i > 0 {
                let prev = lines[i - 1].trim();
                if let Some(comment) = prev.strip_prefix("# ") {
                    comments.insert(target_name.to_string(), comment.to_string());
                }
            }

            targets.push(TaskDefinition {
                name: target_name.to_string(),
                command: format!("make {}", target_name),
                source: "Makefile".to_string(),
                description: comments.get(target_name).cloned(),
            });
        }
    }

    Ok(targets)
}

fn cargo_tasks() -> Vec<TaskDefinition> {
    vec![
        TaskDefinition {
            name: "build".to_string(),
            command: "cargo build".to_string(),
            source: "Cargo.toml".to_string(),
            description: Some("Compile the project".to_string()),
        },
        TaskDefinition {
            name: "test".to_string(),
            command: "cargo test".to_string(),
            source: "Cargo.toml".to_string(),
            description: Some("Run tests".to_string()),
        },
        TaskDefinition {
            name: "clippy".to_string(),
            command: "cargo clippy".to_string(),
            source: "Cargo.toml".to_string(),
            description: Some("Run linter".to_string()),
        },
        TaskDefinition {
            name: "fmt".to_string(),
            command: "cargo fmt".to_string(),
            source: "Cargo.toml".to_string(),
            description: Some("Format code".to_string()),
        },
        TaskDefinition {
            name: "run".to_string(),
            command: "cargo run".to_string(),
            source: "Cargo.toml".to_string(),
            description: Some("Run the binary".to_string()),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn discover_npm_scripts_basic() {
        let dir = TempDir::new().unwrap();
        let pkg = dir.path().join("package.json");
        let mut f = std::fs::File::create(&pkg).unwrap();
        writeln!(
            f,
            r#"{{"scripts": {{"dev": "vite", "build": "tsc && vite build", "test": "vitest"}}}}"#
        )
        .unwrap();

        let tasks = discover_npm_scripts(&pkg).unwrap();
        assert_eq!(tasks.len(), 3);
        assert!(tasks.iter().any(|t| t.name == "dev"));
        assert!(tasks.iter().any(|t| t.name == "build"));
        assert!(tasks.iter().any(|t| t.name == "test"));
        // No lock file → defaults to npm
        assert!(tasks[0].command.starts_with("npm "));
    }

    #[test]
    fn discover_npm_detects_pnpm() {
        let dir = TempDir::new().unwrap();
        let pkg = dir.path().join("package.json");
        let mut f = std::fs::File::create(&pkg).unwrap();
        writeln!(f, r#"{{"scripts": {{"dev": "vite"}}}}"#).unwrap();
        std::fs::File::create(dir.path().join("pnpm-lock.yaml")).unwrap();

        let tasks = discover_npm_scripts(&pkg).unwrap();
        assert_eq!(tasks.len(), 1);
        assert!(tasks[0].command.starts_with("pnpm "));
    }

    #[test]
    fn discover_makefile_basic() {
        let dir = TempDir::new().unwrap();
        let mk = dir.path().join("Makefile");
        let mut f = std::fs::File::create(&mk).unwrap();
        writeln!(
            f,
            "# Build the project\nbuild:\n\tcargo build\n\n# Run tests\ntest:\n\tcargo test\n"
        )
        .unwrap();

        let tasks = discover_makefile_targets(&mk).unwrap();
        assert_eq!(tasks.len(), 2);

        let build = tasks.iter().find(|t| t.name == "build").unwrap();
        assert_eq!(build.command, "make build");
        assert_eq!(build.description.as_deref(), Some("Build the project"));

        let test = tasks.iter().find(|t| t.name == "test").unwrap();
        assert_eq!(test.description.as_deref(), Some("Run tests"));
    }

    #[test]
    fn discover_makefile_skips_special() {
        let dir = TempDir::new().unwrap();
        let mk = dir.path().join("Makefile");
        let mut f = std::fs::File::create(&mk).unwrap();
        writeln!(f, ".PHONY: all\nVAR = value\nall:\n\techo done").unwrap();

        let tasks = discover_makefile_targets(&mk).unwrap();
        // Should find "all" but not ".PHONY" or "VAR"
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].name, "all");
    }

    #[test]
    fn discover_tasks_integration() {
        let dir = TempDir::new().unwrap();

        // Create package.json
        let pkg = dir.path().join("package.json");
        let mut f = std::fs::File::create(&pkg).unwrap();
        writeln!(f, r#"{{"scripts": {{"start": "node index.js"}}}}"#).unwrap();

        let tasks = discover_tasks(dir.path().to_string_lossy().to_string()).unwrap();
        assert!(!tasks.is_empty());
        assert!(tasks.iter().any(|t| t.source == "package.json"));
    }

    #[test]
    fn cargo_tasks_exist() {
        let tasks = cargo_tasks();
        assert!(tasks.len() >= 4);
        assert!(tasks.iter().any(|t| t.name == "build"));
        assert!(tasks.iter().any(|t| t.name == "test"));
    }
}
