pub mod auth;
pub mod repos;

use serde::{Deserialize, Serialize};

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
