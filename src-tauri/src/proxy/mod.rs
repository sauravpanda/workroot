pub mod server;
pub mod switch;

use std::sync::atomic::AtomicU16;
use std::sync::Mutex;

/// Active project routing info, updated atomically.
struct ActiveRoute {
    port: u16,
    worktree_id: Option<i64>,
}

/// Shared proxy state: the port of the currently active project.
/// 0 means no project is active.
pub struct ProxyState {
    /// Port + worktree ID are stored together under a single lock to
    /// prevent readers from seeing a half-updated state.
    active: Mutex<ActiveRoute>,
    pub proxy_running: AtomicU16, // actual port proxy is bound to (3000 if success, 0 if not running)
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(ActiveRoute {
                port: 0,
                worktree_id: None,
            }),
            proxy_running: AtomicU16::new(0),
        }
    }

    pub fn set_active(&self, port: u16, worktree_id: i64) {
        if let Ok(mut route) = self.active.lock() {
            route.port = port;
            route.worktree_id = Some(worktree_id);
        }
    }

    pub fn clear_active(&self) {
        if let Ok(mut route) = self.active.lock() {
            route.port = 0;
            route.worktree_id = None;
        }
    }

    pub fn get_active_port(&self) -> u16 {
        self.active.lock().map(|r| r.port).unwrap_or(0)
    }

    pub fn get_active_worktree_id(&self) -> Option<i64> {
        self.active.lock().ok().and_then(|r| r.worktree_id)
    }
}

impl Default for ProxyState {
    fn default() -> Self {
        Self::new()
    }
}
