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

            if let Err(e) = http1::Builder::new()
                .serve_connection(io, service)
                .with_upgrades()
                .await
            {
                // Connection reset errors are normal when clients disconnect
                let msg = e.to_string();
                if !msg.contains("connection reset") && !msg.contains("broken pipe") {
                    eprintln!("Proxy connection error: {}", e);
                }
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

    // Check for WebSocket upgrade
    let is_upgrade = is_websocket_upgrade(&req);

    if is_upgrade {
        return handle_websocket_upgrade(req, target_port).await;
    }

    // Regular HTTP forwarding
    forward_http_request(req, target_port).await
}

/// Detects WebSocket upgrade requests.
fn is_websocket_upgrade(req: &Request<Incoming>) -> bool {
    let has_upgrade_header = req
        .headers()
        .get(hyper::header::CONNECTION)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_lowercase().contains("upgrade"))
        .unwrap_or(false);

    let is_websocket = req
        .headers()
        .get(hyper::header::UPGRADE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("websocket"))
        .unwrap_or(false);

    has_upgrade_header && is_websocket
}

/// Handles WebSocket upgrade by establishing a TCP tunnel to the target.
async fn handle_websocket_upgrade(
    req: Request<Incoming>,
    target_port: u16,
) -> Result<Response<BoxBody>, hyper::Error> {
    // Connect to target
    let target_addr = format!("127.0.0.1:{}", target_port);
    let target_stream = match tokio::net::TcpStream::connect(&target_addr).await {
        Ok(s) => s,
        Err(_) => {
            return Ok(error_response(
                StatusCode::BAD_GATEWAY,
                &format!("Target server on port {} is not responding", target_port),
            ));
        }
    };

    // Build raw HTTP upgrade request to forward
    let uri = req.uri();
    let path = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    let mut raw_request = format!("GET {} HTTP/1.1\r\n", path);

    for (name, value) in req.headers() {
        if let Ok(v) = value.to_str() {
            raw_request.push_str(&format!("{}: {}\r\n", name, v));
        }
    }
    // Ensure Host header
    if !req.headers().contains_key(hyper::header::HOST) {
        raw_request.push_str(&format!("Host: 127.0.0.1:{}\r\n", target_port));
    }
    raw_request.push_str("\r\n");

    // Send the upgrade request to target
    use tokio::io::AsyncWriteExt;
    let (mut target_read, mut target_write) = target_stream.into_split();
    if target_write
        .write_all(raw_request.as_bytes())
        .await
        .is_err()
    {
        return Ok(error_response(
            StatusCode::BAD_GATEWAY,
            "Failed to forward WebSocket upgrade",
        ));
    }

    // Spawn hyper upgrade handler
    tokio::spawn(async move {
        // Wait for the hyper upgrade to complete
        match hyper::upgrade::on(req).await {
            Ok(upgraded) => {
                let mut client_io = TokioIo::new(upgraded);

                // Bidirectional copy between client and target
                use tokio::io::AsyncReadExt;

                let mut client_buf = vec![0u8; 8192];
                let mut target_buf = vec![0u8; 8192];

                loop {
                    tokio::select! {
                        result = client_io.read(&mut client_buf) => {
                            match result {
                                Ok(0) | Err(_) => break,
                                Ok(n) => {
                                    if target_write.write_all(&client_buf[..n]).await.is_err() {
                                        break;
                                    }
                                }
                            }
                        }
                        result = target_read.read(&mut target_buf) => {
                            match result {
                                Ok(0) | Err(_) => break,
                                Ok(n) => {
                                    use tokio::io::AsyncWriteExt as _;
                                    if client_io.write_all(&target_buf[..n]).await.is_err() {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("WebSocket upgrade error: {}", e);
            }
        }
    });

    // Return 101 Switching Protocols to the client
    Ok(Response::builder()
        .status(StatusCode::SWITCHING_PROTOCOLS)
        .header(hyper::header::CONNECTION, "Upgrade")
        .header(hyper::header::UPGRADE, "websocket")
        .body(http_body_util::Full::new(hyper::body::Bytes::new()))
        .unwrap())
}

/// Forwards a regular HTTP request to the target port.
async fn forward_http_request(
    req: Request<Incoming>,
    target_port: u16,
) -> Result<Response<BoxBody>, hyper::Error> {
    let uri = req.uri();
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    let target_uri = format!("http://127.0.0.1:{}{}", target_port, path_and_query);

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
