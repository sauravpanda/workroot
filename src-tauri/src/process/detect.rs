use super::FrameworkInfo;
use crate::db::queries;
use crate::db::AppDb;
use std::path::Path;
use tauri::State;

/// Detects the package manager used by a Node.js project.
pub fn detect_package_manager(path: &Path) -> Option<String> {
    if path.join("bun.lockb").exists() || path.join("bun.lock").exists() {
        Some("bun".into())
    } else if path.join("pnpm-lock.yaml").exists() {
        Some("pnpm".into())
    } else if path.join("yarn.lock").exists() {
        Some("yarn".into())
    } else if path.join("package-lock.json").exists() || path.join("package.json").exists() {
        Some("npm".into())
    } else {
        None
    }
}

/// Returns the npx-equivalent runner command for a package manager.
fn runner(pm: &str) -> &str {
    match pm {
        "pnpm" => "pnpm",
        "yarn" => "yarn",
        "bun" => "bun",
        _ => "npx",
    }
}

/// Checks if a string appears in a file (used for dependency checks).
fn file_contains(path: &Path, needle: &str) -> bool {
    std::fs::read_to_string(path)
        .map(|c| c.contains(needle))
        .unwrap_or(false)
}

/// Detects the framework and dev command for a project directory.
pub fn detect_framework(path: &Path) -> Option<FrameworkInfo> {
    let pm = detect_package_manager(path);

    // --- Node.js frameworks ---
    if path.join("package.json").exists() {
        let run = runner(pm.as_deref().unwrap_or("npm"));

        // Next.js
        if path.join("next.config.js").exists()
            || path.join("next.config.mjs").exists()
            || path.join("next.config.ts").exists()
            || file_contains(&path.join("package.json"), "\"next\"")
        {
            return Some(FrameworkInfo {
                name: "Next.js".into(),
                dev_command: format!("{} next dev", run),
                package_manager: pm,
                default_port: Some(3000),
            });
        }

        // Vite
        if path.join("vite.config.ts").exists()
            || path.join("vite.config.js").exists()
            || path.join("vite.config.mjs").exists()
        {
            return Some(FrameworkInfo {
                name: "Vite".into(),
                dev_command: format!("{} vite", run),
                package_manager: pm,
                default_port: Some(5173),
            });
        }

        // Nuxt
        if path.join("nuxt.config.ts").exists() || path.join("nuxt.config.js").exists() {
            return Some(FrameworkInfo {
                name: "Nuxt".into(),
                dev_command: format!("{} nuxi dev", run),
                package_manager: pm,
                default_port: Some(3000),
            });
        }

        // Remix
        if file_contains(&path.join("package.json"), "\"@remix-run/") {
            return Some(FrameworkInfo {
                name: "Remix".into(),
                dev_command: format!("{} remix dev", run),
                package_manager: pm,
                default_port: Some(3000),
            });
        }

        // Generic Node.js
        return Some(FrameworkInfo {
            name: "Node.js".into(),
            dev_command: format!("{} run dev", pm.as_deref().unwrap_or("npm")),
            package_manager: pm,
            default_port: None,
        });
    }

    // --- Python frameworks ---
    let has_requirements = path.join("requirements.txt").exists();
    let has_pyproject = path.join("pyproject.toml").exists();
    let has_setup_py = path.join("setup.py").exists();

    if has_requirements || has_pyproject || has_setup_py {
        // FastAPI
        if (has_requirements && file_contains(&path.join("requirements.txt"), "fastapi"))
            || (has_pyproject && file_contains(&path.join("pyproject.toml"), "fastapi"))
        {
            let main = if path.join("main.py").exists() {
                "main:app"
            } else if path.join("app/main.py").exists() {
                "app.main:app"
            } else {
                "main:app"
            };
            return Some(FrameworkInfo {
                name: "FastAPI".into(),
                dev_command: format!("uvicorn {} --reload", main),
                package_manager: None,
                default_port: Some(8000),
            });
        }

        // Django
        if path.join("manage.py").exists()
            && ((has_requirements && file_contains(&path.join("requirements.txt"), "django"))
                || (has_pyproject && file_contains(&path.join("pyproject.toml"), "django")))
        {
            return Some(FrameworkInfo {
                name: "Django".into(),
                dev_command: "python manage.py runserver".into(),
                package_manager: None,
                default_port: Some(8000),
            });
        }

        // Flask
        if (has_requirements && file_contains(&path.join("requirements.txt"), "flask"))
            || (has_pyproject && file_contains(&path.join("pyproject.toml"), "flask"))
        {
            return Some(FrameworkInfo {
                name: "Flask".into(),
                dev_command: "flask run".into(),
                package_manager: None,
                default_port: Some(5000),
            });
        }

        return Some(FrameworkInfo {
            name: "Python".into(),
            dev_command: "python main.py".into(),
            package_manager: None,
            default_port: None,
        });
    }

    // --- Rust ---
    if path.join("Cargo.toml").exists() {
        return Some(FrameworkInfo {
            name: "Rust".into(),
            dev_command: "cargo run".into(),
            package_manager: None,
            default_port: None,
        });
    }

    // --- Go ---
    if path.join("go.mod").exists() {
        return Some(FrameworkInfo {
            name: "Go".into(),
            dev_command: "go run .".into(),
            package_manager: None,
            default_port: None,
        });
    }

    // --- Ruby / Rails ---
    if path.join("Gemfile").exists() {
        if file_contains(&path.join("Gemfile"), "rails") {
            return Some(FrameworkInfo {
                name: "Rails".into(),
                dev_command: "bin/rails server".into(),
                package_manager: None,
                default_port: Some(3000),
            });
        }
        return Some(FrameworkInfo {
            name: "Ruby".into(),
            dev_command: "bundle exec ruby main.rb".into(),
            package_manager: None,
            default_port: None,
        });
    }

    None
}

/// Tauri command: detect framework for a project.
#[tauri::command]
pub fn detect_project_framework(
    db: State<'_, AppDb>,
    project_id: i64,
) -> Result<Option<FrameworkInfo>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let project = queries::get_project(&conn, project_id)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or("Project not found")?;
    drop(conn);

    let path = Path::new(&project.local_path);
    Ok(detect_framework(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_dir() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn detect_nextjs() {
        let dir = make_dir();
        fs::write(
            dir.path().join("package.json"),
            r#"{"dependencies":{"next":"14"}}"#,
        )
        .unwrap();
        fs::write(dir.path().join("next.config.js"), "").unwrap();
        fs::write(dir.path().join("pnpm-lock.yaml"), "").unwrap();

        let fw = detect_framework(dir.path()).unwrap();
        assert_eq!(fw.name, "Next.js");
        assert!(fw.dev_command.contains("next dev"));
        assert_eq!(fw.package_manager.as_deref(), Some("pnpm"));
    }

    #[test]
    fn detect_vite() {
        let dir = make_dir();
        fs::write(dir.path().join("package.json"), "{}").unwrap();
        fs::write(dir.path().join("vite.config.ts"), "").unwrap();

        let fw = detect_framework(dir.path()).unwrap();
        assert_eq!(fw.name, "Vite");
    }

    #[test]
    fn detect_fastapi() {
        let dir = make_dir();
        fs::write(dir.path().join("requirements.txt"), "fastapi\nuvicorn\n").unwrap();
        fs::write(dir.path().join("main.py"), "").unwrap();

        let fw = detect_framework(dir.path()).unwrap();
        assert_eq!(fw.name, "FastAPI");
        assert!(fw.dev_command.contains("uvicorn"));
    }

    #[test]
    fn detect_django() {
        let dir = make_dir();
        fs::write(dir.path().join("requirements.txt"), "django\n").unwrap();
        fs::write(dir.path().join("manage.py"), "").unwrap();

        let fw = detect_framework(dir.path()).unwrap();
        assert_eq!(fw.name, "Django");
    }

    #[test]
    fn detect_go() {
        let dir = make_dir();
        fs::write(dir.path().join("go.mod"), "module example.com/app\n").unwrap();

        let fw = detect_framework(dir.path()).unwrap();
        assert_eq!(fw.name, "Go");
    }

    #[test]
    fn detect_rails() {
        let dir = make_dir();
        fs::write(dir.path().join("Gemfile"), "gem 'rails'\n").unwrap();

        let fw = detect_framework(dir.path()).unwrap();
        assert_eq!(fw.name, "Rails");
    }

    #[test]
    fn detect_package_manager_pnpm() {
        let dir = make_dir();
        fs::write(dir.path().join("pnpm-lock.yaml"), "").unwrap();
        assert_eq!(detect_package_manager(dir.path()), Some("pnpm".into()));
    }

    #[test]
    fn detect_package_manager_bun() {
        let dir = make_dir();
        fs::write(dir.path().join("bun.lockb"), "").unwrap();
        assert_eq!(detect_package_manager(dir.path()), Some("bun".into()));
    }

    #[test]
    fn detect_none() {
        let dir = make_dir();
        assert!(detect_framework(dir.path()).is_none());
    }
}
