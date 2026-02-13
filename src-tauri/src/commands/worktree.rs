use crate::error::AppError;
use crate::git::{metadata, worktree_ops};
use crate::models::{CreateWorktreeRequest, MergeResult, WorktreeInfo};

#[tauri::command]
pub fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, AppError> {
    worktree_ops::list_worktrees(&repo_path)
}

#[tauri::command]
pub fn create_worktree(request: CreateWorktreeRequest) -> Result<WorktreeInfo, AppError> {
    worktree_ops::create_worktree(&request)
}

#[tauri::command]
pub fn delete_worktree(repo_path: String, worktree_name: String) -> Result<(), AppError> {
    worktree_ops::delete_worktree(&repo_path, &worktree_name)
}

#[tauri::command]
pub fn merge_base_branch(repo_path: String, worktree_path: String, base_branch: String) -> Result<MergeResult, AppError> {
    worktree_ops::merge_base_branch(&repo_path, &worktree_path, &base_branch)
}

#[tauri::command]
pub fn rebase_onto_master(repo_path: String, worktree_path: String, base_branch: String) -> Result<MergeResult, AppError> {
    worktree_ops::rebase_onto_master(&repo_path, &worktree_path, &base_branch)
}

#[tauri::command]
pub fn set_base_branch(repo_path: String, worktree_name: String, base_branch: String) -> Result<(), AppError> {
    metadata::save_base_branch(&repo_path, &worktree_name, &base_branch)
}
