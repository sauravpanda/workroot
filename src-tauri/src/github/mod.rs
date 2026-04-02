pub mod activity;
pub mod auth;
pub mod ci;
pub mod pr;
pub mod repos;

use serde::{Deserialize, Serialize};

/// Build a `reqwest::Client` pre-configured for GitHub API calls.
///
/// - 30 s connect timeout
/// - 30 s request timeout
/// - `User-Agent` header required by the GitHub API
pub(crate) fn api_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .user_agent(concat!("workroot/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

/// Represents the device code flow response from GitHub.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

/// Authenticated GitHub user info.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubUser {
    pub login: String,
    pub avatar_url: String,
    pub name: Option<String>,
}
