use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct TaskDep {
    pub source: String,
    pub target: String,
    pub dep_type: String,
}

/// Parse task dependencies from package.json scripts and Makefile targets.
///
/// Returns a list of edges representing a DAG of task dependencies.
#[tauri::command]
pub fn get_task_deps(cwd: String) -> Result<Vec<TaskDep>, String> {
    let dir = Path::new(&cwd);
    let mut deps = Vec::new();

    // package.json
    let pkg_path = dir.join("package.json");
    if pkg_path.exists() {
        match parse_npm_deps(&pkg_path) {
            Ok(mut d) => deps.append(&mut d),
            Err(e) => eprintln!("Failed to parse package.json deps: {}", e),
        }
    }

    // Makefile
    let makefile_path = dir.join("Makefile");
    if makefile_path.exists() {
        match parse_makefile_deps(&makefile_path) {
            Ok(mut d) => deps.append(&mut d),
            Err(e) => eprintln!("Failed to parse Makefile deps: {}", e),
        }
    }

    Ok(deps)
}

/// Parse pre/post script patterns and run-s/npm-run-all chains from package.json.
fn parse_npm_deps(path: &Path) -> Result<Vec<TaskDep>, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let scripts = match json.get("scripts").and_then(|s| s.as_object()) {
        Some(s) => s,
        None => return Ok(Vec::new()),
    };

    let script_names: Vec<String> = scripts.keys().cloned().collect();
    let mut deps = Vec::new();

    for name in &script_names {
        // Detect pre* scripts: if "pretest" exists and "test" exists,
        // then pretest → test (pretest runs before test)
        if let Some(base) = name.strip_prefix("pre") {
            if script_names.iter().any(|n| n == base) {
                deps.push(TaskDep {
                    source: name.clone(),
                    target: base.to_string(),
                    dep_type: "pre".to_string(),
                });
            }
        }

        // Detect post* scripts: if "posttest" exists and "test" exists,
        // then test → posttest (posttest runs after test)
        if let Some(base) = name.strip_prefix("post") {
            if script_names.iter().any(|n| n == base) {
                deps.push(TaskDep {
                    source: base.to_string(),
                    target: name.clone(),
                    dep_type: "post".to_string(),
                });
            }
        }

        // Detect npm-run-all / run-s chains:
        // "build": "run-s clean compile" → clean→compile sequential chain
        if let Some(cmd) = scripts.get(name).and_then(|v| v.as_str()) {
            let trimmed = cmd.trim();
            let chain_args = trimmed.strip_prefix("run-s ").or_else(|| {
                trimmed.strip_prefix("npm-run-all ").filter(|rest| {
                    // npm-run-all without -p flag is sequential
                    !rest.starts_with("-p") && !rest.starts_with("--parallel")
                })
            });

            if let Some(args) = chain_args {
                let steps: Vec<&str> = args.split_whitespace().collect();
                for window in steps.windows(2) {
                    deps.push(TaskDep {
                        source: window[0].to_string(),
                        target: window[1].to_string(),
                        dep_type: "pre".to_string(),
                    });
                }
            }
        }
    }

    Ok(deps)
}

/// Parse Makefile target prerequisites.
fn parse_makefile_deps(path: &Path) -> Result<Vec<TaskDep>, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut deps = Vec::new();

    for line in content.lines() {
        // Skip comments, empty lines, recipe lines (start with tab)
        if line.starts_with('#') || line.starts_with('\t') || line.trim().is_empty() {
            continue;
        }

        // Match target: prerequisite lines
        if let Some(colon_pos) = line.find(':') {
            let target_name = line[..colon_pos].trim();

            // Skip special targets and variables
            if target_name.is_empty()
                || target_name.starts_with('.')
                || target_name.contains('=')
                || target_name.contains('$')
                || target_name.contains(' ')
            {
                continue;
            }

            let prereqs_str = line[colon_pos + 1..].trim();
            if prereqs_str.is_empty() {
                continue;
            }

            for prereq in prereqs_str.split_whitespace() {
                // Skip variable references and special chars
                if prereq.starts_with('$') || prereq.starts_with('.') {
                    continue;
                }
                deps.push(TaskDep {
                    source: prereq.to_string(),
                    target: target_name.to_string(),
                    dep_type: "prerequisite".to_string(),
                });
            }
        }
    }

    Ok(deps)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn npm_pre_post_deps() {
        let dir = TempDir::new().unwrap();
        let pkg = dir.path().join("package.json");
        let mut f = std::fs::File::create(&pkg).unwrap();
        writeln!(
            f,
            r#"{{"scripts": {{"pretest": "lint", "test": "vitest", "posttest": "report"}}}}"#
        )
        .unwrap();

        let deps = parse_npm_deps(&pkg).unwrap();

        let pre = deps.iter().find(|d| d.dep_type == "pre").unwrap();
        assert_eq!(pre.source, "pretest");
        assert_eq!(pre.target, "test");

        let post = deps.iter().find(|d| d.dep_type == "post").unwrap();
        assert_eq!(post.source, "test");
        assert_eq!(post.target, "posttest");
    }

    #[test]
    fn npm_run_s_chain() {
        let dir = TempDir::new().unwrap();
        let pkg = dir.path().join("package.json");
        let mut f = std::fs::File::create(&pkg).unwrap();
        writeln!(
            f,
            r#"{{"scripts": {{"build": "run-s clean compile bundle"}}}}"#
        )
        .unwrap();

        let deps = parse_npm_deps(&pkg).unwrap();
        assert_eq!(deps.len(), 2);
        assert_eq!(deps[0].source, "clean");
        assert_eq!(deps[0].target, "compile");
        assert_eq!(deps[1].source, "compile");
        assert_eq!(deps[1].target, "bundle");
    }

    #[test]
    fn makefile_prerequisites() {
        let dir = TempDir::new().unwrap();
        let mk = dir.path().join("Makefile");
        let mut f = std::fs::File::create(&mk).unwrap();
        writeln!(
            f,
            ".PHONY: all\n\nbuild: clean compile\n\techo done\n\nclean:\n\trm -rf dist"
        )
        .unwrap();

        let deps = parse_makefile_deps(&mk).unwrap();
        assert_eq!(deps.len(), 2);

        let clean_dep = deps.iter().find(|d| d.source == "clean").unwrap();
        assert_eq!(clean_dep.target, "build");
        assert_eq!(clean_dep.dep_type, "prerequisite");

        let compile_dep = deps.iter().find(|d| d.source == "compile").unwrap();
        assert_eq!(compile_dep.target, "build");
    }

    #[test]
    fn get_task_deps_integration() {
        let dir = TempDir::new().unwrap();

        let pkg = dir.path().join("package.json");
        let mut f = std::fs::File::create(&pkg).unwrap();
        writeln!(
            f,
            r#"{{"scripts": {{"pretest": "lint", "test": "vitest"}}}}"#
        )
        .unwrap();

        let deps = get_task_deps(dir.path().to_string_lossy().to_string()).unwrap();
        assert!(!deps.is_empty());
        assert!(deps
            .iter()
            .any(|d| d.source == "pretest" && d.target == "test"));
    }

    #[test]
    fn empty_dir_returns_no_deps() {
        let dir = TempDir::new().unwrap();
        let deps = get_task_deps(dir.path().to_string_lossy().to_string()).unwrap();
        assert!(deps.is_empty());
    }
}
