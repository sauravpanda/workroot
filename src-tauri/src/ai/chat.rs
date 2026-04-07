use serde::{Deserialize, Serialize};

/// A single chat message with role and content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatMessage {
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub timestamp: String,
}

/// Request payload for ai_chat_send.
#[derive(Debug, Deserialize)]
pub struct AiChatRequest {
    pub messages: Vec<AiChatMessage>,
    pub model: Option<String>,
    pub endpoint: Option<String>,
}

/// Response payload from ai_chat_send.
#[derive(Debug, Serialize)]
pub struct AiChatResponse {
    pub content: String,
    pub model: String,
}

const DEFAULT_CHAT_ENDPOINT: &str = "http://localhost:11434/api/chat";
const DEFAULT_TAGS_ENDPOINT: &str = "http://localhost:11434/api/tags";
const DEFAULT_MODEL: &str = "llama3.2";

/// Ollama chat API request body.
#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
}

#[derive(Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

/// Ollama chat API response body.
#[derive(Deserialize)]
struct OllamaChatResponse {
    message: Option<OllamaResponseMessage>,
    #[serde(default)]
    model: String,
}

#[derive(Deserialize)]
struct OllamaResponseMessage {
    content: String,
}

/// Ollama tags API response body.
#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModel>>,
}

#[derive(Deserialize)]
struct OllamaModel {
    name: String,
}

/// Send messages to a local LLM (Ollama by default) and return the response.
#[tauri::command]
pub async fn ai_chat_send(
    messages: Vec<AiChatMessage>,
    model: Option<String>,
    endpoint: Option<String>,
) -> Result<AiChatResponse, String> {
    let url = endpoint.unwrap_or_else(|| DEFAULT_CHAT_ENDPOINT.to_string());
    let model_name = model.unwrap_or_else(|| DEFAULT_MODEL.to_string());

    let ollama_messages: Vec<OllamaMessage> = messages
        .into_iter()
        .map(|m| OllamaMessage {
            role: m.role,
            content: m.content,
        })
        .collect();

    let body = OllamaChatRequest {
        model: model_name.clone(),
        messages: ollama_messages,
        stream: false,
    };

    let client = crate::http_client::shared_client();
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

    let ollama_resp: OllamaChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = ollama_resp.message.map(|m| m.content).unwrap_or_default();

    Ok(AiChatResponse {
        content,
        model: ollama_resp.model,
    })
}

/// List available models from a local LLM server (Ollama by default).
#[tauri::command]
pub async fn ai_chat_list_models(endpoint: Option<String>) -> Result<Vec<String>, String> {
    let url = endpoint.unwrap_or_else(|| DEFAULT_TAGS_ENDPOINT.to_string());

    let client = crate::http_client::shared_client();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("LLM API error: {}", response.status()));
    }

    let tags_resp: OllamaTagsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let models = tags_resp
        .models
        .unwrap_or_default()
        .into_iter()
        .map(|m| m.name)
        .collect();

    Ok(models)
}

/// Check if a local LLM server (Ollama by default) is reachable.
#[tauri::command]
pub async fn ai_check_health(endpoint: Option<String>) -> Result<bool, String> {
    // Use the base Ollama URL for a simple health check
    let url = endpoint.unwrap_or_else(|| "http://localhost:11434".to_string());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;

    match client.get(&url).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}
