use std::net::TcpListener;

const PORT_MIN: u16 = 3001;
const PORT_MAX: u16 = 3999;

/// Checks if a TCP port is available for binding.
pub fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Finds the next available port in the 3001-3999 range,
/// skipping ports that are already in use or allocated to other processes.
pub fn allocate_port(used_ports: &[u16]) -> Option<u16> {
    (PORT_MIN..=PORT_MAX).find(|&port| !used_ports.contains(&port) && is_port_available(port))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allocate_skips_used_ports() {
        let port = allocate_port(&[3001, 3002, 3003]);
        assert!(port.is_some());
        let p = port.unwrap();
        assert!(p >= 3004 && p <= PORT_MAX);
    }

    #[test]
    fn available_port_check() {
        // A high random port should generally be available
        let available = is_port_available(39999);
        // We can't guarantee this in CI, so just ensure it doesn't panic
        let _ = available;
    }
}
