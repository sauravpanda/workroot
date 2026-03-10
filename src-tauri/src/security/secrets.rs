use regex::Regex;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct SecretFinding {
    pub file: String,
    pub line: usize,
    pub secret_type: String,
    pub snippet: String,
}

struct SecretPattern {
    name: &'static str,
    pattern: &'static str,
}

const SECRET_PATTERNS: &[SecretPattern] = &[
    SecretPattern {
        name: "AWS Access Key",
        pattern: r"AKIA[0-9A-Z]{16}",
    },
    SecretPattern {
        name: "GitHub Personal Access Token",
        pattern: r"ghp_[a-zA-Z0-9]{36}",
    },
    SecretPattern {
        name: "GitHub Fine-grained PAT",
        pattern: r"github_pat_[a-zA-Z0-9_]{82}",
    },
    SecretPattern {
        name: "OpenAI API Key",
        pattern: r"sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20}",
    },
    SecretPattern {
        name: "Generic API Key",
        pattern: r#"(?i)(api[_-]?key|api[_-]?secret|access[_-]?token)\s*[:=]\s*["']?[a-zA-Z0-9_\-]{20,}"#,
    },
    SecretPattern {
        name: "Private Key",
        pattern: r"-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----",
    },
    SecretPattern {
        name: "Slack Token",
        pattern: r"xox[bpors]-[0-9]{10,13}-[a-zA-Z0-9-]+",
    },
];

/// Directories to skip when scanning for secrets.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    "__pycache__",
    "vendor",
    ".venv",
    "venv",
];

/// Extensions to skip (binary/media files).
const SKIP_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "svg", "ico", "woff", "woff2", "ttf", "eot", "mp3", "mp4", "avi",
    "zip", "tar", "gz", "pdf", "exe", "dll", "so", "dylib", "wasm",
];

/// Scan files under `cwd` for potential secrets.
#[tauri::command]
pub fn scan_for_secrets(cwd: String) -> Result<Vec<SecretFinding>, String> {
    let compiled: Vec<(&str, Regex)> = SECRET_PATTERNS
        .iter()
        .filter_map(|sp| Regex::new(sp.pattern).ok().map(|r| (sp.name, r)))
        .collect();

    let mut findings = Vec::new();
    walk_directory(Path::new(&cwd), &compiled, &mut findings, 0);
    Ok(findings)
}

fn walk_directory(
    dir: &Path,
    patterns: &[(&str, Regex)],
    findings: &mut Vec<SecretFinding>,
    depth: usize,
) {
    // Limit recursion depth
    if depth > 10 {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();

        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_ref()) {
                continue;
            }
            walk_directory(&path, patterns, findings, depth + 1);
        } else if path.is_file() {
            // Skip binary extensions
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if SKIP_EXTENSIONS.contains(&ext) {
                    continue;
                }
            }

            scan_file(&path, patterns, findings);
        }
    }
}

fn scan_file(path: &Path, patterns: &[(&str, Regex)], findings: &mut Vec<SecretFinding>) {
    // Skip files larger than 1MB
    let metadata = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return,
    };
    if metadata.len() > 1_048_576 {
        return;
    }

    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return, // Skip non-UTF-8 / unreadable files
    };

    let file_str = path.to_string_lossy().to_string();

    for (line_num, line) in content.lines().enumerate() {
        for (secret_type, regex) in patterns {
            if let Some(m) = regex.find(line) {
                // Redact: show first 4 chars, then mask the rest
                let matched = m.as_str();
                let snippet = if matched.len() > 8 {
                    format!("{}...{}", &matched[..4], &matched[matched.len() - 4..])
                } else {
                    "****".to_string()
                };

                findings.push(SecretFinding {
                    file: file_str.clone(),
                    line: line_num + 1,
                    secret_type: secret_type.to_string(),
                    snippet,
                });
            }
        }
    }
}
