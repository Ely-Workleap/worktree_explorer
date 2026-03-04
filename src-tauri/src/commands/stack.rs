use tauri::Emitter;

use crate::error::AppError;
use crate::git::{metadata, split_ops, stack_ops};
use crate::models::{
    AddToStackRequest, CascadeRebaseResult, CreateStackRequest, SplitPlan, SplitResult,
    StackBranchInfo, StackInfo,
};

#[tauri::command]
pub async fn list_stacks(repo_path: String) -> Result<Vec<StackInfo>, AppError> {
    tokio::task::spawn_blocking(move || Ok(metadata::list_stacks(&repo_path)))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn get_stack_details(
    repo_path: String,
    stack_name: String,
) -> Result<Vec<StackBranchInfo>, AppError> {
    tokio::task::spawn_blocking(move || stack_ops::get_stack_details(&repo_path, &stack_name))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn create_stack(
    app: tauri::AppHandle,
    request: CreateStackRequest,
) -> Result<StackInfo, AppError> {
    tokio::task::spawn_blocking(move || {
        stack_ops::create_stack(&request, |progress| {
            let _ = app.emit("create-worktree-progress", &progress);
        })
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn add_branch_to_stack(
    app: tauri::AppHandle,
    request: AddToStackRequest,
) -> Result<StackInfo, AppError> {
    tokio::task::spawn_blocking(move || {
        stack_ops::add_branch_to_stack(&request, |progress| {
            let _ = app.emit("create-worktree-progress", &progress);
        })
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn remove_branch_from_stack(
    repo_path: String,
    stack_name: String,
    branch: String,
    delete_worktree: bool,
) -> Result<StackInfo, AppError> {
    tokio::task::spawn_blocking(move || {
        stack_ops::remove_branch_from_stack(&repo_path, &stack_name, &branch, delete_worktree)
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn delete_stack(
    repo_path: String,
    stack_name: String,
    delete_worktrees: bool,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        stack_ops::delete_stack(&repo_path, &stack_name, delete_worktrees)
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn cascade_rebase(
    app: tauri::AppHandle,
    repo_path: String,
    stack_name: String,
) -> Result<CascadeRebaseResult, AppError> {
    tokio::task::spawn_blocking(move || {
        stack_ops::cascade_rebase(&repo_path, &stack_name, |progress| {
            let _ = app.emit("cascade-rebase-progress", &progress);
        })
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn rename_stack(
    repo_path: String,
    old_name: String,
    new_name: String,
) -> Result<StackInfo, AppError> {
    tokio::task::spawn_blocking(move || metadata::rename_stack(&repo_path, &old_name, &new_name))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn split_into_stack(
    app: tauri::AppHandle,
    plan: SplitPlan,
) -> Result<SplitResult, AppError> {
    tokio::task::spawn_blocking(move || {
        split_ops::execute_split_plan(&plan, |progress| {
            let _ = app.emit("split-progress", &progress);
        })
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}
