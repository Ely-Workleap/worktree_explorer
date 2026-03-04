use tauri::Emitter;

use crate::error::AppError;
use crate::git::{metadata, worktree_ops};
use crate::models::{CreateWorktreeRequest, MergeResult, WorktreeInfo};

#[tauri::command]
pub async fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, AppError> {
    tokio::task::spawn_blocking(move || worktree_ops::list_worktrees(&repo_path))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn create_worktree(app: tauri::AppHandle, request: CreateWorktreeRequest) -> Result<WorktreeInfo, AppError> {
    tokio::task::spawn_blocking(move || {
        worktree_ops::create_worktree(&request, |progress| {
            let _ = app.emit("create-worktree-progress", &progress);
        })
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn delete_worktree(repo_path: String, worktree_name: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || worktree_ops::delete_worktree(&repo_path, &worktree_name))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn merge_base_branch(repo_path: String, worktree_path: String, base_branch: String) -> Result<MergeResult, AppError> {
    tokio::task::spawn_blocking(move || worktree_ops::merge_base_branch(&repo_path, &worktree_path, &base_branch))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn rebase_onto_master(repo_path: String, worktree_path: String, base_branch: String) -> Result<MergeResult, AppError> {
    tokio::task::spawn_blocking(move || worktree_ops::rebase_onto_master(&repo_path, &worktree_path, &base_branch))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn set_base_branch(repo_path: String, worktree_name: String, base_branch: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || metadata::save_base_branch(&repo_path, &worktree_name, &base_branch))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn rebase_continue(worktree_path: String) -> Result<MergeResult, AppError> {
    tokio::task::spawn_blocking(move || worktree_ops::rebase_continue(&worktree_path))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn rebase_skip(worktree_path: String) -> Result<MergeResult, AppError> {
    tokio::task::spawn_blocking(move || worktree_ops::rebase_skip(&worktree_path))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn rebase_abort(worktree_path: String) -> Result<MergeResult, AppError> {
    tokio::task::spawn_blocking(move || worktree_ops::rebase_abort(&worktree_path))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn repair_worktrees(repo_path: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || worktree_ops::repair_worktrees(&repo_path))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}
