use super::ProxyState;
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use std::net::SocketAddr;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::net::TcpListener;

type BoxBody = http_body_util::Full<hyper::body::Bytes>;

/// Starts the reverse proxy on port 3000 in a background task.
pub async fn start_proxy(app_handle: AppHandle) {
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));

    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!(
                "Workroot proxy: port 3000 already in use, proxy not started: {}",
                e
            );
            return;
        }
    };

    // Mark proxy as running
    {
        let state = app_handle.state::<ProxyState>();
        state.proxy_running.store(3000, Ordering::Relaxed);
    };

    let app = Arc::new(app_handle);

    loop {
        let (stream, _) = match listener.accept().await {
            Ok(conn) => conn,
            Err(_) => continue,
        };

        let app_clone = app.clone();
        tokio::spawn(async move {
            let io = TokioIo::new(stream);
            let app_req = app_clone.clone();
            let service = service_fn(move |req| {
                let app_inner = app_req.clone();
                async move { handle_request(req, &app_inner).await }
            });

            if let Err(e) = http1::Builder::new().serve_connection(io, service).await {
                eprintln!("Proxy connection error: {}", e);
            }
        });
    }
}

/// Handles an incoming request by forwarding it to the active project's port.
async fn handle_request(
    req: Request<Incoming>,
    app: &AppHandle,
) -> Result<Response<BoxBody>, hyper::Error> {
    let state = app.state::<ProxyState>();
    let target_port = state.get_active_port();

    if target_port == 0 {
        return Ok(error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            "No active project. Set a project as active in Workroot.",
        ));
    }

    // Build the target URL
    let uri = req.uri();
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    let target_uri = format!("http://127.0.0.1:{}{}", target_port, path_and_query);

    // Build a reqwest request from the hyper request
    let method = req.method().clone();
    let mut headers = req.headers().clone();

    // Add Workroot header
    if let Ok(val) = hyper::header::HeaderValue::from_str(&format!("port-{}", target_port)) {
        headers.insert("x-workroot-project", val);
    }

    // Read the body
    use http_body_util::BodyExt;
    let body_bytes = match req.collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(_) => {
            return Ok(error_response(
                StatusCode::BAD_REQUEST,
                "Failed to read request body",
            ));
        }
    };

    // Forward with reqwest
    let client = reqwest::Client::new();
    let mut builder = client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
        &target_uri,
    );

    // Copy headers (skip host — reqwest sets its own)
    for (name, value) in headers.iter() {
        if name != hyper::header::HOST {
            if let Ok(v) = value.to_str() {
                builder = builder.header(name.as_str(), v);
            }
        }
    }

    if !body_bytes.is_empty() {
        builder = builder.body(body_bytes.to_vec());
    }

    match builder.send().await {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status().as_u16())
                .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

            let mut response_builder = Response::builder().status(status);

            for (name, value) in resp.headers() {
                response_builder = response_builder.header(name.as_str(), value.as_bytes());
            }

            let resp_bytes = resp.bytes().await.unwrap_or_default();
            Ok(response_builder
                .body(http_body_util::Full::new(resp_bytes))
                .unwrap_or_else(|_| {
                    error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to build response",
                    )
                }))
        }
        Err(_) => Ok(error_response(
            StatusCode::BAD_GATEWAY,
            &format!("Target server on port {} is not responding", target_port),
        )),
    }
}

fn error_response(status: StatusCode, message: &str) -> Response<BoxBody> {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain")
        .body(http_body_util::Full::new(hyper::body::Bytes::from(
            message.to_string(),
        )))
        .unwrap()
}

/// Tauri command: get proxy status.
#[tauri::command]
pub fn get_proxy_status(state: State<'_, ProxyState>) -> Result<ProxyInfo, String> {
    let port = state.proxy_running.load(Ordering::Relaxed);
    let active_port = state.get_active_port();
    let worktree_id = state.active_worktree_id.lock().map(|w| *w).unwrap_or(None);

    Ok(ProxyInfo {
        running: port > 0,
        proxy_port: if port > 0 { Some(port) } else { None },
        active_port: if active_port > 0 {
            Some(active_port)
        } else {
            None
        },
        active_worktree_id: worktree_id,
    })
}

/// Tauri command: set the active project for the proxy.
#[tauri::command]
pub fn set_proxy_target(
    state: State<'_, ProxyState>,
    port: u16,
    worktree_id: i64,
) -> Result<(), String> {
    state.set_active(port, worktree_id);
    Ok(())
}

/// Tauri command: clear the active project.
#[tauri::command]
pub fn clear_proxy_target(state: State<'_, ProxyState>) -> Result<(), String> {
    state.clear_active();
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct ProxyInfo {
    pub running: bool,
    pub proxy_port: Option<u16>,
    pub active_port: Option<u16>,
    pub active_worktree_id: Option<i64>,
}
