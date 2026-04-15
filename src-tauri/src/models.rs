use std::collections::HashMap;

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
    pub stack_name: Option<String>,
    pub is_main: bool,
    pub is_dirty: bool,
    pub is_locked: bool,
    pub is_rebasing: bool,
    pub ahead: usize,
    pub behind: usize,
    pub file_changes: usize,
    pub created_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MergeResult {
    pub success: bool,
    pub has_conflicts: bool,
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

#[derive(Debug, Clone, Serialize)]
pub struct ProgressEvent {
    pub step: usize,
    pub total: usize,
    pub message: String,
}

// --- Stack types ---

/// Persisted in the app data directory under "metadata/" (one JSON per repo)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StackInfo {
    pub name: String,
    pub root_branch: String,
    pub branches: Vec<String>,
    #[serde(default)]
    pub pr_numbers: HashMap<String, Option<u64>>,
}

/// Enriched branch info returned by get_stack_details
#[derive(Debug, Clone, Serialize)]
pub struct StackBranchInfo {
    pub branch: String,
    pub worktree_name: Option<String>,
    pub worktree_path: Option<String>,
    pub pr_number: Option<u64>,
    pub is_dirty: bool,
    pub is_rebasing: bool,
    pub ahead: usize,
    pub behind: usize,
    pub file_changes: usize,
    pub position: usize,
}

/// Per-repo build configuration (stored in app metadata).
/// Paths are relative to the worktree root.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildConfig {
    /// Relative path to the .sln file (e.g. "Sharegate.sln")
    pub sln_path: String,
    /// Relative path to the startup executable (e.g. "src/Desktop/bin/Debug/App.exe")
    pub startup_exe: String,
}

/// A GitHub PR that has been checked out as a local worktree.
#[derive(Debug, Clone, Serialize)]
pub struct PrWorktreeInfo {
    pub pr_number: u64,
    pub title: String,
    pub url: String,
    pub head_branch: String,
    pub base_branch: String,
    pub worktree_path: String,
    pub worktree_name: String,
    /// Whether local branch matches the remote PR head. None = could not determine.
    pub is_up_to_date: Option<bool>,
}

/// GitHub PR data (fetched live, not persisted)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrStatus {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub review_decision: Option<String>,
    pub url: String,
    pub base_branch: String,
    pub is_draft: bool,
    pub checks_status: Option<String>,
}

/// Result of cascade rebase
#[derive(Debug, Clone, Serialize)]
pub struct CascadeRebaseResult {
    pub results: Vec<CascadeRebaseStep>,
    pub stopped_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CascadeRebaseStep {
    pub branch: String,
    pub success: bool,
    pub has_conflicts: bool,
    pub message: String,
}

/// Request to create a new stack
#[derive(Debug, Clone, Deserialize)]
pub struct CreateStackRequest {
    pub repo_path: String,
    pub stack_name: String,
    pub root_branch: String,
    pub initial_branch: String,
    pub worktree_name: String,
}

/// Request to add a branch to an existing stack
#[derive(Debug, Clone, Deserialize)]
pub struct AddToStackRequest {
    pub repo_path: String,
    pub stack_name: String,
    pub branch_name: String,
    pub worktree_name: String,
    pub position: Option<usize>,
}

// --- Split types ---

/// A single group in a split plan — becomes one branch/worktree in the stack.
#[derive(Debug, Clone, Deserialize)]
pub struct SplitGroup {
    pub branch_name: String,
    pub worktree_name: String,
    pub description: String,
    /// Scenario A: commit SHAs to cherry-pick (multi-commit source)
    #[serde(default)]
    pub commits: Vec<String>,
    /// Scenario B: file paths to checkout from source branch (single-commit/uncommitted source)
    #[serde(default)]
    pub files: Vec<String>,
}

/// The complete split plan produced by Claude Code's analysis.
#[derive(Debug, Clone, Deserialize)]
pub struct SplitPlan {
    pub repo_path: String,
    pub source_branch: String,
    pub stack_name: String,
    pub root_branch: String,
    pub groups: Vec<SplitGroup>,
}

/// Result of executing a split plan.
#[derive(Debug, Clone, Serialize)]
pub struct SplitResult {
    pub stack: StackInfo,
    pub branches_created: Vec<String>,
    pub worktrees_created: Vec<String>,
    pub backup_branch: String,
}
