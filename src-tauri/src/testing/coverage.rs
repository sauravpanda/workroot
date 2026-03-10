use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct FileCoverage {
    pub file: String,
    pub lines_total: usize,
    pub lines_covered: usize,
    pub percentage: f64,
}

/// Parse LCOV coverage data from a project directory.
#[tauri::command]
pub fn parse_coverage(cwd: String) -> Result<Vec<FileCoverage>, String> {
    let path = Path::new(&cwd);

    // Look for common coverage file locations
    let lcov_paths = [
        path.join("coverage/lcov.info"),
        path.join("coverage/lcov-report/lcov.info"),
        path.join("lcov.info"),
    ];

    let lcov_path = lcov_paths
        .iter()
        .find(|p| p.exists())
        .ok_or("No lcov.info coverage file found")?;

    let content =
        std::fs::read_to_string(lcov_path).map_err(|e| format!("Read lcov.info: {}", e))?;

    parse_lcov(&content)
}

fn parse_lcov(content: &str) -> Result<Vec<FileCoverage>, String> {
    let mut results = Vec::new();
    let mut current_file: Option<String> = None;
    let mut lines_total: usize = 0;
    let mut lines_covered: usize = 0;

    for line in content.lines() {
        let trimmed = line.trim();

        if let Some(sf) = trimmed.strip_prefix("SF:") {
            current_file = Some(sf.to_string());
            lines_total = 0;
            lines_covered = 0;
        } else if let Some(lf) = trimmed.strip_prefix("LF:") {
            if let Ok(n) = lf.parse::<usize>() {
                lines_total = n;
            }
        } else if let Some(lh) = trimmed.strip_prefix("LH:") {
            if let Ok(n) = lh.parse::<usize>() {
                lines_covered = n;
            }
        } else if trimmed == "end_of_record" {
            if let Some(file) = current_file.take() {
                let percentage = if lines_total > 0 {
                    (lines_covered as f64 / lines_total as f64) * 100.0
                } else {
                    0.0
                };

                results.push(FileCoverage {
                    file,
                    lines_total,
                    lines_covered,
                    percentage,
                });
            }
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_lcov_basic() {
        let lcov = "\
SF:/app/src/main.ts
LF:50
LH:45
end_of_record
SF:/app/src/utils.ts
LF:30
LH:10
end_of_record
";
        let results = parse_lcov(lcov).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].file, "/app/src/main.ts");
        assert_eq!(results[0].lines_total, 50);
        assert_eq!(results[0].lines_covered, 45);
        assert!((results[0].percentage - 90.0).abs() < 0.01);
        assert_eq!(results[1].file, "/app/src/utils.ts");
        assert!((results[1].percentage - 33.33).abs() < 0.1);
    }

    #[test]
    fn parse_lcov_empty() {
        let results = parse_lcov("").unwrap();
        assert!(results.is_empty());
    }
}
