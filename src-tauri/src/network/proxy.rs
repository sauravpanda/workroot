use super::TrafficEntry;
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;

use crate::db::AppDb;
use crate::network::logging;
use std::sync::OnceLock;

/// Shared no-proxy client for the forward proxy (bypasses system proxy to avoid loops).
static NO_PROXY_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn no_proxy_client() -> &'static reqwest::Client {
    NO_PROXY_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

type BoxBody = http_body_util::Full<hyper::body::Bytes>;

const FORWARD_PROXY_PORT: u16 = 8888;
const MAX_BODY_CAPTURE: usize = 64 * 1024; // 64KB

/// Start the HTTP forward proxy on port 8888.
pub async fn start_forward_proxy(app_handle: AppHandle) {
    let addr = SocketAddr::from(([127, 0, 0, 1], FORWARD_PROXY_PORT));

    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!(
                "Workroot forward proxy: port {} already in use: {}",
                FORWARD_PROXY_PORT, e
            );
            return;
        }
    };

    eprintln!(
        "Workroot forward proxy listening on port {}",
        FORWARD_PROXY_PORT
    );

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
                async move { handle_proxy_request(req, &app_inner).await }
            });

            if let Err(e) = http1::Builder::new()
                .serve_connection(io, service)
                .with_upgrades()
                .await
            {
                let msg = e.to_string();
                if !msg.contains("connection reset") && !msg.contains("broken pipe") {
                    eprintln!("Forward proxy error: {}", e);
                }
            }
        });
    }
}

/// Handle an incoming proxy request.
async fn handle_proxy_request(
    req: Request<Incoming>,
    app: &AppHandle,
) -> Result<Response<BoxBody>, hyper::Error> {
    // CONNECT method for HTTPS tunneling
    if req.method() == Method::CONNECT {
        return handle_connect(req).await;
    }

    // Regular HTTP forwarding with capture
    handle_forward(req, app).await
}

/// Handle CONNECT method for HTTPS tunneling.
/// We tunnel the bytes without inspecting (no MITM).
async fn handle_connect(req: Request<Incoming>) -> Result<Response<BoxBody>, hyper::Error> {
    let host = req
        .uri()
        .authority()
        .map(|a| a.to_string())
        .unwrap_or_default();

    if host.is_empty() {
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            "CONNECT requires a host:port target",
        ));
    }

    tokio::spawn(async move {
        match hyper::upgrade::on(req).await {
            Ok(upgraded) => {
                let mut client = TokioIo::new(upgraded);
                match tokio::net::TcpStream::connect(&host).await {
                    Ok(mut target) => {
                        use tokio::io;
                        let _ = io::copy_bidirectional(&mut client, &mut target).await;
                    }
                    Err(e) => {
                        eprintln!("CONNECT tunnel failed to {}: {}", host, e);
                    }
                }
            }
            Err(e) => {
                eprintln!("CONNECT upgrade failed: {}", e);
            }
        }
    });

    // Return 200 to indicate tunnel established
    Ok(Response::builder()
        .status(StatusCode::OK)
        .body(http_body_util::Full::new(hyper::body::Bytes::new()))
        .unwrap())
}

/// Forward an HTTP request, capturing request and response for logging.
async fn handle_forward(
    req: Request<Incoming>,
    app: &AppHandle,
) -> Result<Response<BoxBody>, hyper::Error> {
    let start = Instant::now();

    let method = req.method().to_string();
    let url = req.uri().to_string();

    // Capture request headers
    let req_headers: Vec<String> = req
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|v| format!("{}: {}", k, v)))
        .collect();
    let request_headers = req_headers.join("\n");

    // Read request body
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

    let request_body = if body_bytes.is_empty() {
        None
    } else {
        Some(truncate_body(&body_bytes))
    };

    // Forward the request (shared no-proxy client reuses connections)
    let client = no_proxy_client();
    let mut builder = client.request(
        reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET),
        &url,
    );

    for header_line in &req_headers {
        if let Some((k, v)) = header_line.split_once(": ") {
            let k_lower = k.to_lowercase();
            if k_lower != "host" && k_lower != "proxy-connection" {
                builder = builder.header(k, v);
            }
        }
    }

    if !body_bytes.is_empty() {
        builder = builder.body(body_bytes.to_vec());
    }

    let (status_code, response_headers, response_body, hyper_response) = match builder.send().await
    {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let resp_headers: Vec<String> = resp
                .headers()
                .iter()
                .filter_map(|(k, v)| v.to_str().ok().map(|v| format!("{}: {}", k, v)))
                .collect();
            let resp_headers_str = resp_headers.join("\n");

            let hyper_status = StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY);

            let resp_bytes = resp.bytes().await.unwrap_or_default();
            let resp_body = truncate_body(&resp_bytes);

            let mut response_builder = Response::builder().status(hyper_status);
            // Re-parse response headers for the forwarded response
            for header_line in &resp_headers {
                if let Some((k, v)) = header_line.split_once(": ") {
                    if let Ok(val) = hyper::header::HeaderValue::from_str(v) {
                        response_builder = response_builder.header(k, val);
                    }
                }
            }

            let hyper_response = response_builder
                .body(http_body_util::Full::new(resp_bytes))
                .unwrap_or_else(|_| {
                    error_response(StatusCode::INTERNAL_SERVER_ERROR, "Response build failed")
                });

            (
                Some(status),
                Some(resp_headers_str),
                Some(resp_body),
                hyper_response,
            )
        }
        Err(e) => {
            let hyper_response = error_response(
                StatusCode::BAD_GATEWAY,
                &format!("Forward proxy: upstream error: {}", e),
            );
            (None, None, None, hyper_response)
        }
    };

    let duration_ms = start.elapsed().as_millis() as i64;

    // Log the traffic entry
    let entry = TrafficEntry {
        process_id: None, // TODO: map to process via env var
        method,
        url,
        status_code,
        request_headers,
        request_body,
        response_headers,
        response_body,
        duration_ms: Some(duration_ms),
    };

    // Fire-and-forget logging
    let db_state = app.try_state::<AppDb>();
    if let Some(db) = db_state {
        let _ = logging::log_traffic(&db, &entry);
    }

    Ok(hyper_response)
}

/// Truncate body bytes to a string, capped at MAX_BODY_CAPTURE.
fn truncate_body(bytes: &[u8]) -> String {
    let slice = if bytes.len() > MAX_BODY_CAPTURE {
        &bytes[..MAX_BODY_CAPTURE]
    } else {
        bytes
    };

    // Check if it looks like binary
    let non_text = slice
        .iter()
        .filter(|&&b| b < 0x09 || (b > 0x0D && b < 0x20))
        .count();
    if non_text > slice.len() / 10 {
        return format!("[binary, {} bytes]", bytes.len());
    }

    String::from_utf8_lossy(slice).to_string()
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
