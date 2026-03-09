pub mod detect;
pub mod schema;

use serde::Serialize;

/// Supported database types.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DbType {
    Postgres,
    Sqlite,
    Mysql,
}

/// Parsed database connection configuration.
#[derive(Debug, Clone, Serialize)]
pub struct DbConfig {
    pub db_type: DbType,
    pub url: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
}
