use std::sync::OnceLock;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static NO_PROXY_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// Returns a shared `reqwest::Client` that reuses connections across requests.
pub fn shared_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(reqwest::Client::new)
}

/// Returns a shared `reqwest::Client` configured to bypass proxy settings.
pub fn shared_no_proxy_client() -> &'static reqwest::Client {
    NO_PROXY_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}
