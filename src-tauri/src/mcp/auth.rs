use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;
use hyper::StatusCode;
use rand::Rng;
use std::sync::Arc;

/// Generates a random 32-byte hex session token.
pub fn generate_session_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Axum middleware that validates the Authorization: Bearer <token> header.
pub async fn validate_token(request: Request, next: Next) -> Result<Response, StatusCode> {
    let expected = request.extensions().get::<Arc<String>>().cloned();

    let expected_token = match expected {
        Some(t) => t,
        None => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            let token = &header[7..];
            if token == expected_token.as_str() {
                Ok(next.run(request).await)
            } else {
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

/// Writes the session token to a discoverable location for MCP clients.
pub fn write_token_file(token: &str, app_data_dir: &std::path::Path) -> Result<(), String> {
    let token_path = app_data_dir.join("mcp-token");
    std::fs::write(&token_path, token).map_err(|e| format!("Failed to write MCP token: {}", e))?;

    // Set restrictive permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        let _ = std::fs::set_permissions(&token_path, perms);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_is_64_hex_chars() {
        let token = generate_session_token();
        assert_eq!(token.len(), 64);
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn tokens_are_unique() {
        let t1 = generate_session_token();
        let t2 = generate_session_token();
        assert_ne!(t1, t2);
    }
}
