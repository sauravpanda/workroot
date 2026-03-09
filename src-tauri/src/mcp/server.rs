use super::auth;
use super::tools;
use crate::shell::{self, ShellCommand};
use axum::extract::Extension;
use axum::middleware;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::AppHandle;
use tower_http::cors::{AllowOrigin, CorsLayer};

/// MCP server version.
const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Health check response.
#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
    server: &'static str,
}

/// Tool definition for the /tools endpoint.
#[derive(Serialize)]
struct ToolDef {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

/// JSON-RPC 2.0 request.
#[derive(Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    method: String,
    params: Option<serde_json::Value>,
    id: serde_json::Value,
}

/// JSON-RPC 2.0 response.
#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: &'static str,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
    id: serde_json::Value,
}

/// JSON-RPC 2.0 error.
#[derive(Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

/// Starts the MCP server on localhost:4444.
pub async fn start_mcp_server(app_handle: AppHandle, app_data_dir: std::path::PathBuf) {
    let token = auth::generate_session_token();

    // Write token for MCP client discovery
    if let Err(e) = auth::write_token_file(&token, &app_data_dir) {
        eprintln!("MCP: {}", e);
    }

    let shared_token = Arc::new(token);
    let shared_app = Arc::new(app_handle);

    // Routes that require auth
    let protected_routes = Router::new()
        .route("/tools", get(handle_tools))
        .route("/mcp", post(handle_mcp))
        .layer(middleware::from_fn(auth::validate_token));

    // Public routes
    let app = Router::new()
        .route("/health", get(handle_health))
        .route("/shell-hook", post(handle_shell_hook))
        .merge(protected_routes)
        .layer(Extension(shared_token))
        .layer(Extension(shared_app))
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::predicate(|origin, _| {
                    origin
                        .to_str()
                        .map(|o| {
                            o.starts_with("http://localhost") || o.starts_with("http://127.0.0.1")
                        })
                        .unwrap_or(false)
                }))
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        );

    let addr = SocketAddr::from(([127, 0, 0, 1], 4444));

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!(
                "MCP server: port 4444 already in use, server not started: {}",
                e
            );
            return;
        }
    };

    eprintln!("MCP server listening on http://127.0.0.1:4444");

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("MCP server error: {}", e);
    }
}

/// GET /health — public health check.
async fn handle_health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: VERSION,
        server: "workroot-mcp",
    })
}

/// GET /tools — list available MCP tools with schemas.
async fn handle_tools() -> Json<Vec<ToolDef>> {
    let tools = vec![
        ToolDef {
            name: "get_running_projects".into(),
            description:
                "List all running dev server processes with project name, branch, port, and status"
                    .into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolDef {
            name: "get_project_info".into(),
            description:
                "Get detailed info about a project including framework, path, and worktrees".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "Project ID" }
                },
                "required": ["project_id"]
            }),
        },
        ToolDef {
            name: "get_env_vars".into(),
            description:
                "List environment variable keys for a worktree's active profile (values hidden)"
                    .into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "worktree_id": { "type": "integer" }
                },
                "required": ["worktree_id"]
            }),
        },
        ToolDef {
            name: "get_env_var_value".into(),
            description: "Get the decrypted value of a specific env var key".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "worktree_id": { "type": "integer" },
                    "key": { "type": "string" }
                },
                "required": ["worktree_id", "key"]
            }),
        },
        ToolDef {
            name: "get_recent_logs".into(),
            description: "Get recent log lines from a running process".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "process_id": { "type": "integer" },
                    "lines": { "type": "integer", "default": 50 },
                    "stream": { "type": "string", "enum": ["stdout", "stderr", "all"] }
                },
                "required": ["process_id"]
            }),
        },
        ToolDef {
            name: "search_logs".into(),
            description: "Search log content for a process".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "process_id": { "type": "integer" },
                    "query": { "type": "string" }
                },
                "required": ["process_id", "query"]
            }),
        },
        ToolDef {
            name: "get_error_logs".into(),
            description: "Get stderr-only log lines from a process (error shortcut)".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "process_id": { "type": "integer" },
                    "lines": { "type": "integer", "default": 50 }
                },
                "required": ["process_id"]
            }),
        },
        ToolDef {
            name: "get_active_proxy".into(),
            description: "Get the project currently routed through the :3000 proxy".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolDef {
            name: "switch_active_proxy".into(),
            description: "Switch the :3000 proxy target to a different worktree".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "worktree_id": { "type": "integer" }
                },
                "required": ["worktree_id"]
            }),
        },
        ToolDef {
            name: "get_proxy_status".into(),
            description: "Get proxy health status".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
    ];

    Json(tools)
}

/// POST /mcp — JSON-RPC 2.0 tool invocation endpoint.
async fn handle_mcp(
    Extension(app): Extension<Arc<AppHandle>>,
    Json(req): Json<JsonRpcRequest>,
) -> Json<JsonRpcResponse> {
    if req.jsonrpc != "2.0" {
        return Json(JsonRpcResponse {
            jsonrpc: "2.0",
            result: None,
            error: Some(JsonRpcError {
                code: -32600,
                message: "Invalid Request: jsonrpc must be \"2.0\"".into(),
            }),
            id: req.id,
        });
    }

    match tools::dispatch(&app, &req.method, req.params) {
        Ok(result) => Json(JsonRpcResponse {
            jsonrpc: "2.0",
            result: Some(result),
            error: None,
            id: req.id,
        }),
        Err(msg) => {
            let code = if msg.contains("not found") {
                -32601
            } else {
                -32000
            };
            Json(JsonRpcResponse {
                jsonrpc: "2.0",
                result: None,
                error: Some(JsonRpcError { code, message: msg }),
                id: req.id,
            })
        }
    }
}

/// POST /shell-hook — receive shell command from hook scripts (public, no auth).
async fn handle_shell_hook(
    Extension(app): Extension<Arc<AppHandle>>,
    Json(payload): Json<ShellCommand>,
) -> Json<serde_json::Value> {
    match shell::hook::receive_command(&app, payload) {
        Ok(id) => Json(serde_json::json!({ "ok": true, "id": id })),
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e })),
    }
}
