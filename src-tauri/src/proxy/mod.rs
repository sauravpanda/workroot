pub mod server;

use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;

/// Shared proxy state: the port of the currently active project.
/// 0 means no project is active.
pub struct ProxyState {
    pub active_port: AtomicU16,
    pub active_worktree_id: Mutex<Option<i64>>,
    pub proxy_running: AtomicU16, // actual port proxy is bound to (3000 if success, 0 if not running)
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            active_port: AtomicU16::new(0),
            active_worktree_id: Mutex::new(None),
            proxy_running: AtomicU16::new(0),
        }
    }

    pub fn set_active(&self, port: u16, worktree_id: i64) {
        self.active_port.store(port, Ordering::Relaxed);
        if let Ok(mut wt) = self.active_worktree_id.lock() {
            *wt = Some(worktree_id);
        }
    }

    pub fn clear_active(&self) {
        self.active_port.store(0, Ordering::Relaxed);
        if let Ok(mut wt) = self.active_worktree_id.lock() {
            *wt = None;
        }
    }

    pub fn get_active_port(&self) -> u16 {
        self.active_port.load(Ordering::Relaxed)
    }
}

impl Default for ProxyState {
    fn default() -> Self {
        Self::new()
    }
}
