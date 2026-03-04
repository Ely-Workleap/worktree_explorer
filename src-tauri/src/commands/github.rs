use std::collections::HashMap;

use tauri::Emitter;

use crate::error::AppError;
use crate::git::{github, metadata};
use crate::git::stack_ops;
use crate::models::PrStatus;

#[tauri::command]
pub async fn check_gh_available() -> Result<bool, AppError> {
    tokio::task::spawn_blocking(|| Ok(github::is_gh_available()))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn get_stack_pr_statuses(
    repo_path: String,
    stack_name: String,
) -> Result<HashMap<String, PrStatus>, AppError> {
    tokio::task::spawn_blocking(move || {
        let meta = metadata::read_metadata_v2(&repo_path);
        let stack = meta
            .stacks
            .get(&stack_name)
            .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", stack_name)))?;
        Ok(github::get_pr_statuses_batch(&repo_path, &stack.branches))
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn create_stack_prs(
    app: tauri::AppHandle,
    repo_path: String,
    stack_name: String,
    is_draft: bool,
) -> Result<Vec<PrStatus>, AppError> {
    tokio::task::spawn_blocking(move || {
        let meta = metadata::read_metadata_v2(&repo_path);
        let stack = meta
            .stacks
            .get(&stack_name)
            .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", stack_name)))?
            .clone();

        let mut created = Vec::new();
        let total = stack.branches.len();

        for (i, branch) in stack.branches.iter().enumerate() {
            let _ = app.emit("create-prs-progress", &crate::models::ProgressEvent {
                step: i + 1,
                total,
                message: format!("Processing {}...", branch),
            });

            // Check if PR already exists
            if github::get_pr_status(&repo_path, branch).is_some() {
                continue;
            }

            // Determine base branch for the PR
            let base = if i == 0 {
                stack.root_branch.clone()
            } else {
                stack.branches[i - 1].clone()
            };

            let title = branch.split('/').last().unwrap_or(branch).to_string();
            let body = format!(
                "Part of stack **{}**\n\nBase: `{}`",
                stack_name, base
            );

            match github::create_pr(&repo_path, &base, branch, &title, &body, is_draft) {
                Ok(pr) => {
                    // Save PR number in metadata
                    let _ = metadata::set_pr_number(&repo_path, &stack_name, branch, Some(pr.number));
                    created.push(pr);
                }
                Err(e) => {
                    return Err(AppError::Custom(format!(
                        "Failed to create PR for {}: {}",
                        branch, e
                    )));
                }
            }
        }

        Ok(created)
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn update_stack_pr_bases(
    repo_path: String,
    stack_name: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let meta = metadata::read_metadata_v2(&repo_path);
        let stack = meta
            .stacks
            .get(&stack_name)
            .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", stack_name)))?
            .clone();

        for (i, branch) in stack.branches.iter().enumerate() {
            let expected_base = if i == 0 {
                &stack.root_branch
            } else {
                &stack.branches[i - 1]
            };

            if let Some(pr) = github::get_pr_status(&repo_path, branch) {
                if pr.base_branch != *expected_base {
                    github::update_pr_base(&repo_path, pr.number, expected_base)?;
                }
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn push_stack(
    app: tauri::AppHandle,
    repo_path: String,
    stack_name: String,
    force: bool,
) -> Result<Vec<String>, AppError> {
    tokio::task::spawn_blocking(move || {
        let details = stack_ops::get_stack_details(&repo_path, &stack_name)?;
        let mut pushed = Vec::new();
        let total = details.len();

        for (i, branch_info) in details.iter().enumerate() {
            let _ = app.emit("push-stack-progress", &crate::models::ProgressEvent {
                step: i + 1,
                total,
                message: format!("Pushing {}...", branch_info.branch),
            });

            if let Some(wt_path) = &branch_info.worktree_path {
                if force {
                    github::force_push_branch(wt_path, &branch_info.branch)?;
                } else {
                    let output = std::process::Command::new("git")
                        .args(["-C", wt_path, "push", "origin", &branch_info.branch])
                        .output()
                        .map_err(|e| AppError::Custom(format!("Failed to push: {}", e)))?;
                    if !output.status.success() {
                        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                        return Err(AppError::Custom(format!(
                            "Failed to push {}: {}",
                            branch_info.branch,
                            stderr.trim()
                        )));
                    }
                }
                pushed.push(branch_info.branch.clone());
            }
        }

        Ok(pushed)
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}
