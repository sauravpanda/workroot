pub mod branch;
pub mod commit;
pub mod compare;
pub mod diff;
pub mod worktree;

use serde::Serialize;

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
}

#[derive(Debug, Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
}
