use serde::{Deserialize, Serialize};

/// A single chat message with role and content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatMessage {
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub timestamp: String,
}

/// Response payload from ai_chat_send.
#[derive(Debug, Serialize)]
pub struct AiChatResponse {
    pub content: String,
    pub model: String,
}

const DEFAULT_OLLAMA_CHAT: &str = "http://localhost:11434/api/chat";
const DEFAULT_OLLAMA_TAGS: &str = "http://localhost:11434/api/tags";
const DEFAULT_OLLAMA_MODEL: &str = "llama3.2";
const OPENAI_CHAT_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_ENDPOINT: &str = "https://api.openai.com/v1/models";
const ANTHROPIC_CHAT_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

/* ── Ollama types ─────────────────────────────────────────────────── */

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

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModel>>,
}

#[derive(Deserialize)]
struct OllamaModel {
    name: String,
}

/* ── OpenAI types ─────────────────────────────────────────────────── */

#[derive(Serialize)]
struct OpenAiChatRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    stream: bool,
}

#[derive(Serialize)]
struct OpenAiMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAiChatResponse {
    choices: Vec<OpenAiChoice>,
    #[serde(default)]
    model: String,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: OpenAiChoiceMessage,
}

#[derive(Deserialize)]
struct OpenAiChoiceMessage {
    content: String,
}

#[derive(Deserialize)]
struct OpenAiModelsResponse {
    data: Vec<OpenAiModel>,
}

#[derive(Deserialize)]
struct OpenAiModel {
    id: String,
}

/* ── Anthropic types ──────────────────────────────────────────────── */

#[derive(Serialize)]
struct AnthropicChatRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    max_tokens: u32,
}

#[derive(Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct AnthropicChatResponse {
    content: Vec<AnthropicContent>,
    #[serde(default)]
    model: String,
}

#[derive(Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

/* ── Commands ─────────────────────────────────────────────────────── */

/// Send messages to a configured LLM provider and return the response.
#[tauri::command]
pub async fn ai_chat_send(
    messages: Vec<AiChatMessage>,
    model: Option<String>,
    endpoint: Option<String>,
    provider: Option<String>,
    api_key: Option<String>,
) -> Result<AiChatResponse, String> {
    match provider.as_deref().unwrap_or("ollama") {
        "openai" => {
            let key = api_key
                .filter(|k| !k.is_empty())
                .ok_or("OpenAI API key is required")?;
            let url = endpoint.unwrap_or_else(|| OPENAI_CHAT_ENDPOINT.to_string());
            let model_name = model.unwrap_or_else(|| "gpt-4o".to_string());

            let oai_messages: Vec<OpenAiMessage> = messages
                .into_iter()
                .map(|m| OpenAiMessage {
                    role: m.role,
                    content: m.content,
                })
                .collect();

            let body = OpenAiChatRequest {
                model: model_name,
                messages: oai_messages,
                stream: false,
            };

            let client = reqwest::Client::new();
            let resp = client
                .post(&url)
                .bearer_auth(&key)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("OpenAI API error ({}): {}", status, text));
            }

            let oai_resp: OpenAiChatResponse = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {}", e))?;
            let content = oai_resp
                .choices
                .into_iter()
                .next()
                .map(|c| c.message.content)
                .unwrap_or_default();

            Ok(AiChatResponse {
                content,
                model: oai_resp.model,
            })
        }

        "anthropic" => {
            let key = api_key
                .filter(|k| !k.is_empty())
                .ok_or("Anthropic API key is required")?;
            let url = endpoint.unwrap_or_else(|| ANTHROPIC_CHAT_ENDPOINT.to_string());
            let model_name = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());

            let anth_messages: Vec<AnthropicMessage> = messages
                .into_iter()
                .map(|m| AnthropicMessage {
                    role: m.role,
                    content: m.content,
                })
                .collect();

            let body = AnthropicChatRequest {
                model: model_name,
                messages: anth_messages,
                max_tokens: 4096,
            };

            let client = reqwest::Client::new();
            let resp = client
                .post(&url)
                .header("x-api-key", &key)
                .header("anthropic-version", ANTHROPIC_VERSION)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("Anthropic API error ({}): {}", status, text));
            }

            let anth_resp: AnthropicChatResponse = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {}", e))?;
            let content = anth_resp
                .content
                .into_iter()
                .find(|c| c.content_type == "text")
                .and_then(|c| c.text)
                .unwrap_or_default();

            Ok(AiChatResponse {
                content,
                model: anth_resp.model,
            })
        }

        _ => {
            // Ollama / local LLM
            let url = endpoint.unwrap_or_else(|| DEFAULT_OLLAMA_CHAT.to_string());
            let model_name = model.unwrap_or_else(|| DEFAULT_OLLAMA_MODEL.to_string());

            let ollama_messages: Vec<OllamaMessage> = messages
                .into_iter()
                .map(|m| OllamaMessage {
                    role: m.role,
                    content: m.content,
                })
                .collect();

            let body = OllamaChatRequest {
                model: model_name,
                messages: ollama_messages,
                stream: false,
            };

            let client = reqwest::Client::new();
            let resp = client
                .post(&url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("LLM API error ({}): {}", status, text));
            }

            let ollama_resp: OllamaChatResponse = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {}", e))?;
            let content = ollama_resp.message.map(|m| m.content).unwrap_or_default();

            Ok(AiChatResponse {
                content,
                model: ollama_resp.model,
            })
        }
    }
}

/// List available models for the configured provider.
#[tauri::command]
pub async fn ai_chat_list_models(
    endpoint: Option<String>,
    provider: Option<String>,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    match provider.as_deref().unwrap_or("ollama") {
        "openai" => {
            let key = api_key
                .filter(|k| !k.is_empty())
                .ok_or("OpenAI API key is required")?;

            let client = reqwest::Client::new();
            let resp = client
                .get(OPENAI_MODELS_ENDPOINT)
                .bearer_auth(&key)
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("OpenAI API error: {}", resp.status()));
            }

            let models_resp: OpenAiModelsResponse = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            let mut models: Vec<String> = models_resp
                .data
                .into_iter()
                .map(|m| m.id)
                .filter(|id| {
                    id.contains("gpt")
                        || id.starts_with("o1")
                        || id.starts_with("o3")
                        || id.starts_with("o4")
                })
                .collect();
            models.sort();
            Ok(models)
        }

        "anthropic" => Ok(vec![
            "claude-opus-4-6".to_string(),
            "claude-sonnet-4-6".to_string(),
            "claude-haiku-4-5-20251001".to_string(),
        ]),

        _ => {
            let url = endpoint.unwrap_or_else(|| DEFAULT_OLLAMA_TAGS.to_string());
            let client = reqwest::Client::new();
            let resp = client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("LLM API error: {}", resp.status()));
            }

            let tags_resp: OllamaTagsResponse = resp
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
    }
}

/// Check if the configured provider is reachable / has credentials set.
///
/// For cloud providers (openai, anthropic) returns Err("API key required")
/// when no key is configured, so the frontend can show a distinct "no key" state.
#[tauri::command]
pub async fn ai_check_health(
    endpoint: Option<String>,
    provider: Option<String>,
    api_key: Option<String>,
) -> Result<bool, String> {
    match provider.as_deref().unwrap_or("ollama") {
        "openai" | "anthropic" => {
            if api_key.as_deref().map(|k| k.is_empty()).unwrap_or(true) {
                Err("API key required".to_string())
            } else {
                Ok(true)
            }
        }
        _ => {
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
    }
}
