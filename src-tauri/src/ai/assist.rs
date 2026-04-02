use serde::{Deserialize, Serialize};

const DEFAULT_GENERATE_ENDPOINT: &str = "http://localhost:11434/api/generate";
const DEFAULT_MODEL: &str = "llama3.2";

/// Ollama generate API request body (single-shot, non-chat).
#[derive(Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    stream: bool,
}

/// Ollama generate API response body.
#[derive(Deserialize)]
struct OllamaGenerateResponse {
    response: Option<String>,
}

/// Send a single-shot prompt to the local LLM via the `/api/generate` endpoint.
async fn generate(
    system: &str,
    prompt: &str,
    model: Option<String>,
    endpoint: Option<String>,
) -> Result<String, String> {
    let url = endpoint.unwrap_or_else(|| DEFAULT_GENERATE_ENDPOINT.to_string());
    let model_name = model.unwrap_or_else(|| DEFAULT_MODEL.to_string());

    let body = OllamaGenerateRequest {
        model: model_name,
        prompt: prompt.to_string(),
        system: Some(system.to_string()),
        stream: false,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response
            .text()
            .await
            .unwrap_or_else(|_| "unknown".to_string());
        return Err(format!("LLM API error ({}): {}", status, text));
    }

    let ollama_resp: OllamaGenerateResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(ollama_resp.response.unwrap_or_default())
}

/// Generate a conventional commit message from a git diff.
///
/// Takes the staged diff and returns a suggested commit message following the
/// Conventional Commits specification (e.g. `feat:`, `fix:`, `refactor:`).
#[tauri::command]
pub async fn ai_generate_commit_message(
    diff: String,
    model: Option<String>,
    endpoint: Option<String>,
) -> Result<String, String> {
    if diff.trim().is_empty() {
        return Err("Diff is empty — nothing to generate a commit message for.".to_string());
    }

    let system = "\
You are a commit message generator. Given a git diff, produce a single \
conventional commit message. Follow the Conventional Commits specification:\n\
- Start with a type: feat, fix, refactor, docs, style, test, chore, perf, ci, build\n\
- Optionally include a scope in parentheses\n\
- Write a concise subject line (≤72 chars) in imperative mood\n\
- If the change is complex, add a blank line followed by a short body\n\
\n\
Output ONLY the commit message text, nothing else. Do not wrap it in quotes or \
markdown code blocks.";

    let prompt = format!(
        "Generate a commit message for the following diff:\n\n{}",
        diff
    );

    generate(system, &prompt, model, endpoint).await
}

/// Generate a structured PR description from a title, branch name, and diff.
///
/// Returns a markdown-formatted description with Summary, Changes, and Test Plan
/// sections.
#[tauri::command]
pub async fn ai_generate_pr_description(
    title: String,
    branch_name: String,
    diff: String,
    model: Option<String>,
    endpoint: Option<String>,
) -> Result<String, String> {
    if diff.trim().is_empty() {
        return Err("Diff is empty — nothing to generate a PR description for.".to_string());
    }

    let system = "\
You are a pull request description generator. Given a PR title, branch name, and \
the combined diff, produce a well-structured PR description in markdown with these \
sections:\n\
\n\
## Summary\n\
A concise 1–3 sentence overview of the change.\n\
\n\
## Changes\n\
A bulleted list of the key changes made.\n\
\n\
## Test Plan\n\
A bulleted checklist of steps to verify the change works correctly.\n\
\n\
Output ONLY the markdown description. Do not include the PR title itself.";

    let prompt = format!(
        "PR Title: {}\nBranch: {}\n\nDiff:\n\n{}",
        title, branch_name, diff
    );

    generate(system, &prompt, model, endpoint).await
}

/// Diagnose an error message and suggest a fix.
///
/// Takes an error message string and optional context (file path, language) and
/// returns an explanation of the error along with a suggested fix.
#[tauri::command]
pub async fn ai_diagnose_error(
    error_message: String,
    file_path: Option<String>,
    language: Option<String>,
    model: Option<String>,
    endpoint: Option<String>,
) -> Result<String, String> {
    if error_message.trim().is_empty() {
        return Err("Error message is empty — nothing to diagnose.".to_string());
    }

    let system = "\
You are a software error diagnostic assistant. Given an error message and optional \
context (file path, programming language), provide:\n\
\n\
1. **Explanation**: A clear, concise explanation of what the error means.\n\
2. **Likely Cause**: The most probable reason this error occurred.\n\
3. **Suggested Fix**: A concrete code change or action to resolve the error.\n\
\n\
Be specific and actionable. If you are unsure, say so rather than guessing.";

    let mut prompt = format!("Error:\n{}", error_message);
    if let Some(ref path) = file_path {
        prompt.push_str(&format!("\n\nFile: {}", path));
    }
    if let Some(ref lang) = language {
        prompt.push_str(&format!("\nLanguage: {}", lang));
    }

    generate(system, &prompt, model, endpoint).await
}

/// Explain what a code snippet does.
///
/// Takes a code snippet and optional language identifier, and returns a
/// human-readable explanation of the code's behaviour.
#[tauri::command]
pub async fn ai_explain_code(
    code: String,
    language: Option<String>,
    model: Option<String>,
    endpoint: Option<String>,
) -> Result<String, String> {
    if code.trim().is_empty() {
        return Err("Code snippet is empty — nothing to explain.".to_string());
    }

    let system = "\
You are a code explanation assistant. Given a code snippet (and optionally the \
programming language), explain what the code does in clear, concise language.\n\
\n\
- Start with a one-sentence summary of the code's purpose.\n\
- Then walk through the key logic step by step.\n\
- Mention any notable patterns, potential issues, or edge cases.\n\
\n\
Write for a developer audience. Be concise but thorough.";

    let mut prompt = String::new();
    if let Some(ref lang) = language {
        prompt.push_str(&format!("Language: {}\n\n", lang));
    }
    prompt.push_str(&format!("```\n{}\n```", code));

    generate(system, &prompt, model, endpoint).await
}
