use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub description: String,
    pub entry_point: String,
    pub language: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct PluginExecResult {
    pub plugin_name: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
}

/// Validate that a cwd is absolute and resolve the plugins directory,
/// ensuring the resolved path stays within the expected boundary.
fn validated_plugins_dir(cwd: &str) -> Result<PathBuf, String> {
    let cwd_path = PathBuf::from(cwd);
    if !cwd_path.is_absolute() {
        return Err("cwd must be an absolute path".to_string());
    }

    let plugins_dir = cwd_path.join(".workroot").join("plugins");
    Ok(plugins_dir)
}

/// Resolve a plugin directory and verify it is contained within the
/// expected plugins root. Returns the canonicalized plugin path.
fn validated_plugin_dir(cwd: &str, plugin_name: &str) -> Result<PathBuf, String> {
    // Reject plugin names that contain path separators or parent refs
    if plugin_name.contains('/')
        || plugin_name.contains('\\')
        || plugin_name.contains("..")
        || plugin_name.is_empty()
    {
        return Err(format!(
            "Invalid plugin name: '{}'. Must not contain path separators or '..'",
            plugin_name
        ));
    }

    let plugins_dir = validated_plugins_dir(cwd)?;
    let plugin_dir = plugins_dir.join(plugin_name);

    if !plugin_dir.exists() {
        return Err(format!("Plugin '{}' not found", plugin_name));
    }

    let canonical_plugins = plugins_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve plugins directory: {e}"))?;
    let canonical_plugin = plugin_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve plugin directory: {e}"))?;

    if !canonical_plugin.starts_with(&canonical_plugins) {
        return Err(format!(
            "Plugin path escapes the plugins directory: '{}'",
            plugin_name
        ));
    }

    Ok(canonical_plugin)
}

/// Scan the `.workroot/plugins/` directory for plugin manifests.
#[tauri::command]
pub fn discover_plugins(cwd: String) -> Result<Vec<PluginManifest>, String> {
    let plugins_dir = validated_plugins_dir(&cwd)?;

    if !plugins_dir.exists() {
        return Ok(vec![]);
    }

    let entries = std::fs::read_dir(&plugins_dir).map_err(|e| format!("Read plugins dir: {e}"))?;

    let mut manifests = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Read entry: {e}"))?;
        let path = entry.path();
        if path.is_dir() {
            let manifest_path = path.join("plugin.json");
            if manifest_path.exists() {
                let contents = std::fs::read_to_string(&manifest_path)
                    .map_err(|e| format!("Read manifest {}: {e}", manifest_path.display()))?;
                let manifest: PluginManifest = serde_json::from_str(&contents)
                    .map_err(|e| format!("Parse manifest {}: {e}", manifest_path.display()))?;
                manifests.push(manifest);
            }
        }
    }

    Ok(manifests)
}

/// Execute a plugin by name, running its entry point in a subprocess.
#[tauri::command]
pub async fn execute_plugin(
    cwd: String,
    plugin_name: String,
    args: Vec<String>,
) -> Result<PluginExecResult, String> {
    let plugin_dir = validated_plugin_dir(&cwd, &plugin_name)?;

    let manifest_path = plugin_dir.join("plugin.json");
    if !manifest_path.exists() {
        return Err(format!("Plugin '{}' manifest not found", plugin_name));
    }

    let contents =
        std::fs::read_to_string(&manifest_path).map_err(|e| format!("Read manifest: {e}"))?;
    let manifest: PluginManifest =
        serde_json::from_str(&contents).map_err(|e| format!("Parse manifest: {e}"))?;

    // Validate entry_point doesn't escape the plugin directory
    if manifest.entry_point.contains("..") || manifest.entry_point.starts_with('/') {
        return Err(format!("Invalid entry_point in plugin '{}'", plugin_name));
    }

    let entry_path = plugin_dir.join(&manifest.entry_point);
    let canonical_entry = entry_path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve entry point: {e}"))?;
    if !canonical_entry.starts_with(&plugin_dir) {
        return Err(format!(
            "Entry point escapes plugin directory: '{}'",
            manifest.entry_point
        ));
    }

    let (program, mut cmd_args) = match manifest.language.as_str() {
        "node" => (
            "node".to_string(),
            vec![entry_path.to_string_lossy().to_string()],
        ),
        "python" => (
            "python3".to_string(),
            vec![entry_path.to_string_lossy().to_string()],
        ),
        "shell" => (
            "sh".to_string(),
            vec![entry_path.to_string_lossy().to_string()],
        ),
        other => return Err(format!("Unsupported plugin language: {other}")),
    };
    cmd_args.extend(args);

    let start = Instant::now();

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::process::Command::new(&program)
            .args(&cmd_args)
            .current_dir(&plugin_dir)
            .output(),
    )
    .await
    .map_err(|_| format!("Plugin '{}' timed out after 30 seconds", plugin_name))?
    .map_err(|e| format!("Execute plugin '{}': {e}", plugin_name))?;

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(PluginExecResult {
        plugin_name,
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        duration_ms,
    })
}

/// Download a plugin manifest from a URL and create its directory structure.
#[tauri::command]
pub async fn install_plugin_from_url(cwd: String, url: String) -> Result<PluginManifest, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client build failed: {e}"))?;
    let body = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download manifest: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Read response body: {e}"))?;

    let manifest: PluginManifest =
        serde_json::from_str(&body).map_err(|e| format!("Parse manifest: {e}"))?;

    // Validate plugin name from manifest before using it as a path component
    if manifest.name.contains('/')
        || manifest.name.contains('\\')
        || manifest.name.contains("..")
        || manifest.name.is_empty()
    {
        return Err(format!(
            "Invalid plugin name in manifest: '{}'. Must not contain path separators or '..'",
            manifest.name
        ));
    }

    let plugins_dir = validated_plugins_dir(&cwd)?;
    let plugin_dir = plugins_dir.join(&manifest.name);

    std::fs::create_dir_all(&plugin_dir).map_err(|e| format!("Create plugin dir: {e}"))?;

    let manifest_path = plugin_dir.join("plugin.json");
    std::fs::write(&manifest_path, &body).map_err(|e| format!("Write manifest: {e}"))?;

    Ok(manifest)
}
