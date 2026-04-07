pub mod server;
pub mod switch;

use std::sync::atomic::AtomicU16;
use std::sync::Mutex;

/// Active routing target — port and worktree ID are updated atomically.
#[derive(Clone, Copy)]
pub struct ActiveTarget {
    pub port: u16,
    pub worktree_id: Option<i64>,
}

/// Shared proxy state: the port of the currently active project.
/// 0 means no project is active.
pub struct ProxyState {
    active: Mutex<ActiveTarget>,
    pub proxy_running: AtomicU16, // actual port proxy is bound to (3000 if success, 0 if not running)
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(ActiveTarget {
                port: 0,
                worktree_id: None,
            }),
            proxy_running: AtomicU16::new(0),
        }
    }

    pub fn set_active(&self, port: u16, worktree_id: i64) {
        if let Ok(mut target) = self.active.lock() {
            target.port = port;
            target.worktree_id = Some(worktree_id);
        }
    }

    pub fn clear_active(&self) {
        if let Ok(mut target) = self.active.lock() {
            target.port = 0;
            target.worktree_id = None;
        }
    }

    pub fn get_active_port(&self) -> u16 {
        self.active.lock().map(|t| t.port).unwrap_or(0)
    }

    pub fn get_active(&self) -> ActiveTarget {
        self.active.lock().map(|t| *t).unwrap_or(ActiveTarget {
            port: 0,
            worktree_id: None,
        })
    }
}

impl Default for ProxyState {
    fn default() -> Self {
        Self::new()
    }
}
