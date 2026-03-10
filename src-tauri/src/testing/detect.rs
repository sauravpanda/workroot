use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct DetectedTestFramework {
    pub name: String,
    pub command: String,
    pub config_file: String,
}

/// Detect test frameworks present in a project directory.
#[tauri::command]
pub fn detect_test_frameworks(cwd: String) -> Result<Vec<DetectedTestFramework>, String> {
    let path = Path::new(&cwd);
    let mut frameworks = Vec::new();

    // Vitest
    for config in &[
        "vitest.config.ts",
        "vitest.config.js",
        "vitest.config.mts",
        "vitest.config.mjs",
    ] {
        if path.join(config).exists() {
            frameworks.push(DetectedTestFramework {
                name: "vitest".to_string(),
                command: "npx vitest run".to_string(),
                config_file: config.to_string(),
            });
            break;
        }
    }

    // Jest
    for config in &[
        "jest.config.ts",
        "jest.config.js",
        "jest.config.mjs",
        "jest.config.cjs",
    ] {
        if path.join(config).exists() {
            frameworks.push(DetectedTestFramework {
                name: "jest".to_string(),
                command: "npx jest".to_string(),
                config_file: config.to_string(),
            });
            break;
        }
    }

    // Also check package.json for jest config
    if frameworks.iter().all(|f| f.name != "jest") {
        let pkg_path = path.join("package.json");
        if pkg_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&pkg_path) {
                if content.contains("\"jest\"") {
                    frameworks.push(DetectedTestFramework {
                        name: "jest".to_string(),
                        command: "npx jest".to_string(),
                        config_file: "package.json".to_string(),
                    });
                }
            }
        }
    }

    // pytest
    for config in &["pytest.ini", "pyproject.toml", "setup.cfg"] {
        let config_path = path.join(config);
        if config_path.exists() {
            // For pyproject.toml and setup.cfg, check if pytest is referenced
            if *config == "pyproject.toml" || *config == "setup.cfg" {
                if let Ok(content) = std::fs::read_to_string(&config_path) {
                    if !content.contains("pytest") {
                        continue;
                    }
                }
            }
            frameworks.push(DetectedTestFramework {
                name: "pytest".to_string(),
                command: "pytest".to_string(),
                config_file: config.to_string(),
            });
            break;
        }
    }

    // Cargo test (Rust)
    if path.join("Cargo.toml").exists() {
        frameworks.push(DetectedTestFramework {
            name: "cargo-test".to_string(),
            command: "cargo test".to_string(),
            config_file: "Cargo.toml".to_string(),
        });
    }

    // Go test
    if path.join("go.mod").exists() {
        frameworks.push(DetectedTestFramework {
            name: "go-test".to_string(),
            command: "go test ./...".to_string(),
            config_file: "go.mod".to_string(),
        });
    }

    Ok(frameworks)
}
