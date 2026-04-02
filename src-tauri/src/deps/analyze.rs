use regex::Regex;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
pub struct DependencyInfo {
    pub name: String,
    pub version: String,
    pub dep_type: String,
    pub latest_version: Option<String>,
    pub outdated: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct DependencySummary {
    pub total: usize,
    pub production: usize,
    pub dev: usize,
    pub outdated: usize,
    pub dependencies: Vec<DependencyInfo>,
}

/// Analyze project dependencies from package.json and/or Cargo.toml.
#[tauri::command]
pub fn analyze_dependencies(cwd: String) -> Result<DependencySummary, String> {
    let cwd_path = PathBuf::from(&cwd);
    let mut all_deps: Vec<DependencyInfo> = Vec::new();

    // --- npm: package.json ---
    let package_json_path = cwd_path.join("package.json");
    if package_json_path.exists() {
        let contents = std::fs::read_to_string(&package_json_path)
            .map_err(|e| format!("Read package.json: {e}"))?;
        let json: serde_json::Value =
            serde_json::from_str(&contents).map_err(|e| format!("Parse package.json: {e}"))?;

        let npm_sections = [
            ("dependencies", "production"),
            ("devDependencies", "dev"),
            ("peerDependencies", "peer"),
            ("optionalDependencies", "optional"),
        ];

        for (section, dep_type) in &npm_sections {
            if let Some(obj) = json.get(section).and_then(|v| v.as_object()) {
                for (name, version) in obj {
                    all_deps.push(DependencyInfo {
                        name: name.clone(),
                        version: version.as_str().unwrap_or("*").to_string(),
                        dep_type: dep_type.to_string(),
                        latest_version: None,
                        outdated: false,
                    });
                }
            }
        }
    }

    // --- Rust: Cargo.toml ---
    let cargo_toml_path = cwd_path.join("Cargo.toml");
    if cargo_toml_path.exists() {
        let contents = std::fs::read_to_string(&cargo_toml_path)
            .map_err(|e| format!("Read Cargo.toml: {e}"))?;

        parse_cargo_deps(&contents, &mut all_deps);
    }

    let production = all_deps
        .iter()
        .filter(|d| d.dep_type == "production")
        .count();
    let dev = all_deps.iter().filter(|d| d.dep_type == "dev").count();
    let outdated = all_deps.iter().filter(|d| d.outdated).count();
    let total = all_deps.len();

    Ok(DependencySummary {
        total,
        production,
        dev,
        outdated,
        dependencies: all_deps,
    })
}

/// Parse Cargo.toml sections for dependencies using regex.
fn parse_cargo_deps(contents: &str, deps: &mut Vec<DependencyInfo>) {
    let section_re = Regex::new(r"(?m)^\[(.*?)\]\s*$").unwrap();
    let simple_dep_re = Regex::new(r#"(?m)^(\S+)\s*=\s*"([^"]+)""#).unwrap();
    let table_dep_re = Regex::new(r#"(?m)^(\S+)\s*=\s*\{.*?version\s*=\s*"([^"]+)".*?\}"#).unwrap();

    let sections: Vec<(usize, &str)> = section_re
        .captures_iter(contents)
        .map(|cap| (cap.get(0).unwrap().start(), cap.get(1).unwrap().as_str()))
        .collect();

    let cargo_sections = [
        ("dependencies", "production"),
        ("dev-dependencies", "dev"),
        ("build-dependencies", "dev"),
    ];

    for (section_name, dep_type) in &cargo_sections {
        for (idx, &(start, name)) in sections.iter().enumerate() {
            if name != *section_name {
                continue;
            }
            let end = if idx + 1 < sections.len() {
                sections[idx + 1].0
            } else {
                contents.len()
            };
            let section_text = &contents[start..end];

            for cap in simple_dep_re.captures_iter(section_text) {
                let dep_name = cap.get(1).unwrap().as_str();
                // Skip the section header line itself
                if dep_name.starts_with('[') {
                    continue;
                }
                deps.push(DependencyInfo {
                    name: dep_name.to_string(),
                    version: cap.get(2).unwrap().as_str().to_string(),
                    dep_type: dep_type.to_string(),
                    latest_version: None,
                    outdated: false,
                });
            }

            for cap in table_dep_re.captures_iter(section_text) {
                let dep_name = cap.get(1).unwrap().as_str();
                if dep_name.starts_with('[') {
                    continue;
                }
                // Avoid duplicates from simple_dep_re
                let already = deps.iter().any(|d| d.name == dep_name);
                if !already {
                    deps.push(DependencyInfo {
                        name: dep_name.to_string(),
                        version: cap.get(2).unwrap().as_str().to_string(),
                        dep_type: dep_type.to_string(),
                        latest_version: None,
                        outdated: false,
                    });
                }
            }
        }
    }
}
