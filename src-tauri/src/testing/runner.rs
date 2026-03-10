use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct TestResult {
    pub name: String,
    pub status: String,
    pub duration_ms: Option<f64>,
    pub error: Option<String>,
}

/// Run tests using the specified framework.
#[tauri::command]
pub async fn run_tests(
    cwd: String,
    framework: String,
    filter: Option<String>,
) -> Result<Vec<TestResult>, String> {
    match framework.as_str() {
        "vitest" => run_vitest(&cwd, filter.as_deref()),
        "jest" => run_jest(&cwd, filter.as_deref()),
        "cargo-test" => run_cargo_test(&cwd, filter.as_deref()),
        "pytest" => run_pytest(&cwd, filter.as_deref()),
        "go-test" => run_go_test(&cwd, filter.as_deref()),
        _ => Err(format!("Unsupported framework: {}", framework)),
    }
}

fn run_vitest(cwd: &str, filter: Option<&str>) -> Result<Vec<TestResult>, String> {
    let mut args = vec!["vitest", "run", "--reporter=json"];
    let filter_owned;
    if let Some(f) = filter {
        filter_owned = f.to_string();
        args.push(&filter_owned);
    }

    let output = Command::new("npx")
        .args(&args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Run vitest: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_vitest_json(&stdout)
}

fn parse_vitest_json(output: &str) -> Result<Vec<TestResult>, String> {
    // Vitest JSON output may have extra text before the JSON object
    let json_start = output.find('{');
    let json_str = match json_start {
        Some(i) => &output[i..],
        None => {
            return Ok(vec![TestResult {
                name: "test-run".to_string(),
                status: "error".to_string(),
                duration_ms: None,
                error: Some("Could not parse vitest output".to_string()),
            }]);
        }
    };

    let parsed: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| format!("Parse vitest: {}", e))?;

    let mut results = Vec::new();

    if let Some(test_results) = parsed.get("testResults").and_then(|t| t.as_array()) {
        for suite in test_results {
            if let Some(tests) = suite.get("assertionResults").and_then(|a| a.as_array()) {
                for test in tests {
                    let name = test
                        .get("fullName")
                        .or_else(|| test.get("title"))
                        .and_then(|n| n.as_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let status = test
                        .get("status")
                        .and_then(|s| s.as_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let duration = test.get("duration").and_then(|d| d.as_f64());

                    let error = test
                        .get("failureMessages")
                        .and_then(|m| m.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|m| m.as_str())
                        .map(String::from);

                    results.push(TestResult {
                        name,
                        status,
                        duration_ms: duration,
                        error,
                    });
                }
            }
        }
    }

    Ok(results)
}

fn run_jest(cwd: &str, filter: Option<&str>) -> Result<Vec<TestResult>, String> {
    let mut args = vec!["jest", "--json"];
    let filter_owned;
    if let Some(f) = filter {
        filter_owned = f.to_string();
        args.push(&filter_owned);
    }

    let output = Command::new("npx")
        .args(&args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Run jest: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Jest JSON format is very similar to vitest
    parse_vitest_json(&stdout)
}

fn run_cargo_test(cwd: &str, filter: Option<&str>) -> Result<Vec<TestResult>, String> {
    let mut args = vec!["test"];
    if let Some(f) = filter {
        args.push(f);
    }
    args.push("--");
    args.push("--format=json");
    args.push("-Z");
    args.push("unstable-options");

    let output = Command::new("cargo")
        .args(&args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Run cargo test: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut results = Vec::new();
    for line in stdout.lines() {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(line) {
            if parsed.get("type").and_then(|t| t.as_str()) == Some("test") {
                if let Some(event) = parsed.get("event").and_then(|e| e.as_str()) {
                    let name = parsed
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let status = match event {
                        "ok" => "passed",
                        "failed" => "failed",
                        "ignored" => "skipped",
                        _ => event,
                    }
                    .to_string();

                    let error = if event == "failed" {
                        parsed
                            .get("stdout")
                            .and_then(|s| s.as_str())
                            .map(String::from)
                    } else {
                        None
                    };

                    results.push(TestResult {
                        name,
                        status,
                        duration_ms: None,
                        error,
                    });
                }
            }
        }
    }

    Ok(results)
}

fn run_pytest(cwd: &str, filter: Option<&str>) -> Result<Vec<TestResult>, String> {
    let mut args = vec!["-v", "--tb=short"];
    if let Some(f) = filter {
        args.push("-k");
        args.push(f);
    }

    let output = Command::new("pytest")
        .args(&args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Run pytest: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut results = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.contains("PASSED") || trimmed.contains("FAILED") || trimmed.contains("SKIPPED") {
            let status = if trimmed.contains("PASSED") {
                "passed"
            } else if trimmed.contains("FAILED") {
                "failed"
            } else {
                "skipped"
            };

            // Extract test name (everything before PASSED/FAILED/SKIPPED)
            let name = trimmed
                .split(" PASSED")
                .next()
                .or_else(|| trimmed.split(" FAILED").next())
                .or_else(|| trimmed.split(" SKIPPED").next())
                .unwrap_or(trimmed)
                .trim()
                .to_string();

            results.push(TestResult {
                name,
                status: status.to_string(),
                duration_ms: None,
                error: None,
            });
        }
    }

    Ok(results)
}

fn run_go_test(cwd: &str, filter: Option<&str>) -> Result<Vec<TestResult>, String> {
    let mut args = vec!["test", "-json", "./..."];
    let run_flag;
    if let Some(f) = filter {
        run_flag = format!("-run={}", f);
        args.push(&run_flag);
    }

    let output = Command::new("go")
        .args(&args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Run go test: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut results = Vec::new();
    for line in stdout.lines() {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(action) = parsed.get("Action").and_then(|a| a.as_str()) {
                if (action == "pass" || action == "fail" || action == "skip")
                    && parsed.get("Test").is_some()
                {
                    let name = parsed
                        .get("Test")
                        .and_then(|t| t.as_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let status = match action {
                        "pass" => "passed",
                        "fail" => "failed",
                        "skip" => "skipped",
                        _ => action,
                    }
                    .to_string();

                    let elapsed = parsed
                        .get("Elapsed")
                        .and_then(|e| e.as_f64())
                        .map(|e| e * 1000.0); // Convert seconds to ms

                    results.push(TestResult {
                        name,
                        status,
                        duration_ms: elapsed,
                        error: None,
                    });
                }
            }
        }
    }

    Ok(results)
}
