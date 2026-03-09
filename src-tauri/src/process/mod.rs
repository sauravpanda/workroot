pub mod detect;

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct FrameworkInfo {
    pub name: String,
    pub dev_command: String,
    pub package_manager: Option<String>,
    pub default_port: Option<u16>,
}
