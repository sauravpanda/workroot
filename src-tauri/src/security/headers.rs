use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct HeaderCheck {
    pub name: String,
    pub present: bool,
    pub value: Option<String>,
    pub recommendation: String,
}

struct ExpectedHeader {
    name: &'static str,
    recommendation: &'static str,
}

const SECURITY_HEADERS: &[ExpectedHeader] = &[
    ExpectedHeader {
        name: "Content-Security-Policy",
        recommendation: "Set a Content-Security-Policy to prevent XSS and data injection attacks.",
    },
    ExpectedHeader {
        name: "Strict-Transport-Security",
        recommendation: "Set Strict-Transport-Security (HSTS) to enforce HTTPS connections.",
    },
    ExpectedHeader {
        name: "X-Frame-Options",
        recommendation: "Set X-Frame-Options to DENY or SAMEORIGIN to prevent clickjacking.",
    },
    ExpectedHeader {
        name: "X-Content-Type-Options",
        recommendation: "Set X-Content-Type-Options: nosniff to prevent MIME-type sniffing.",
    },
    ExpectedHeader {
        name: "Referrer-Policy",
        recommendation: "Set Referrer-Policy to control how much referrer information is shared.",
    },
    ExpectedHeader {
        name: "Permissions-Policy",
        recommendation: "Set Permissions-Policy to control which browser features can be used.",
    },
];

/// Check a URL for security headers.
#[tauri::command]
pub async fn check_security_headers(url: String) -> Result<Vec<HeaderCheck>, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request: {}", e))?;

    let headers = response.headers();

    let mut checks = Vec::new();

    for expected in SECURITY_HEADERS {
        let header_value = headers
            .get(expected.name)
            .map(|v| v.to_str().unwrap_or("<non-ascii>").to_string());

        checks.push(HeaderCheck {
            name: expected.name.to_string(),
            present: header_value.is_some(),
            value: header_value,
            recommendation: expected.recommendation.to_string(),
        });
    }

    Ok(checks)
}
