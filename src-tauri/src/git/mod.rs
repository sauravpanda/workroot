pub mod analytics;
pub mod blame;
pub mod branch;
pub mod checkpoint;
pub mod commit;
pub mod compare;
pub mod conflicts;
pub mod diff;
pub mod hooks;
pub mod log;
pub mod stash;
pub mod tags;
pub mod worktree;

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct DeleteWarnings {
    pub is_dirty: bool,
    pub unpushed_commits: u32,
}

#[derive(Debug, Serialize)]
pub struct WorktreeInfo {
    pub id: i64,
    pub project_id: i64,
    pub branch_name: String,
    pub path: String,
    pub status: String,
    pub is_dirty: bool,
    pub port: Option<i64>,
    pub created_at: String,
    pub deleted_at: Option<String>,
    pub hidden_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
}
