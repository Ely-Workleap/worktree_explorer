use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct RepoInfo {
    pub name: String,
    pub path: String,
    pub worktree_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub base_branch: Option<String>,
    pub is_main: bool,
    pub is_dirty: bool,
    pub is_locked: bool,
    pub ahead: usize,
    pub behind: usize,
    pub file_changes: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct MergeResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_remote: bool,
    pub is_head: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateWorktreeRequest {
    pub repo_path: String,
    pub name: String,
    pub branch: Option<String>,
    pub create_branch: bool,
    pub base_branch: Option<String>,
}
