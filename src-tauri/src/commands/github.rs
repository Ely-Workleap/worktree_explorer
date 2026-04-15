use std::collections::HashMap;

use crate::util::silent_command;

use tauri::Emitter;

use crate::error::AppError;
use crate::git::{github, metadata};
use crate::git::stack_ops;
use crate::models::{PrStatus, PrWorktreeInfo};
use crate::git::worktree_ops;

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
                    let output = silent_command("git")
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

/// Pull the latest changes for a PR worktree (re-fetch + reset).
#[tauri::command]
pub async fn pull_pr_worktree(
    repo_path: String,
    worktree_path: String,
    pr_number: u64,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || github::pull_pr(&repo_path, &worktree_path, pr_number))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

/// Fetch a GitHub PR and check it out as a sibling worktree. Idempotent.
#[tauri::command]
pub async fn checkout_pr_worktree(
    repo_path: String,
    pr_number: u64,
) -> Result<PrWorktreeInfo, AppError> {
    tokio::task::spawn_blocking(move || github::checkout_pr(&repo_path, pr_number))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

/// List all PR worktrees (branches matching `pr/<number>`) for a repo.
/// Fetches PR metadata from GitHub for each; degrades gracefully if `gh` is unavailable.
/// Also checks if local branches are up-to-date with remote PR heads.
#[tauri::command]
pub async fn list_pr_worktrees(
    repo_path: String,
) -> Result<Vec<PrWorktreeInfo>, AppError> {
    tokio::task::spawn_blocking(move || {
        let worktrees = worktree_ops::list_worktrees(&repo_path)?;
        let gh_ok = github::is_gh_available();

        // Collect PR worktrees first so we know which PR numbers to query
        let mut pr_wts: Vec<(u64, String, String, String)> = Vec::new(); // (number, branch, path, name)
        for wt in &worktrees {
            let branch = match &wt.branch {
                Some(b) => b.clone(),
                None => continue,
            };
            let num_str = match branch.strip_prefix("pr/") {
                Some(s) => s,
                None => continue,
            };
            let pr_number: u64 = match num_str.parse() {
                Ok(n) => n,
                Err(_) => continue,
            };
            pr_wts.push((pr_number, branch, wt.path.clone(), wt.name.clone()));
        }

        if pr_wts.is_empty() {
            return Ok(Vec::new());
        }

        // Batch-fetch remote PR head SHAs with a single git ls-remote call
        let remote_shas = fetch_remote_pr_shas(&repo_path, &pr_wts.iter().map(|(n, ..)| *n).collect::<Vec<_>>());

        let mut result = Vec::new();
        for (pr_number, branch, wt_path, wt_name) in pr_wts {
            let (title, url, head_branch, base_branch) = if gh_ok {
                fetch_pr_meta_lightweight(&repo_path, pr_number)
            } else {
                (String::new(), String::new(), branch.clone(), String::new())
            };

            // Compare local HEAD with remote SHA
            let is_up_to_date = remote_shas.as_ref().ok().and_then(|shas| {
                let remote_sha = shas.get(&pr_number)?;
                let local_sha = get_local_head_sha(&wt_path)?;
                Some(local_sha == *remote_sha)
            });

            result.push(PrWorktreeInfo {
                pr_number,
                title,
                url,
                head_branch,
                base_branch,
                worktree_path: wt_path,
                worktree_name: wt_name,
                is_up_to_date,
            });
        }

        Ok(result)
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

/// Batch-fetch remote SHAs for PR head refs using a single `git ls-remote` call.
fn fetch_remote_pr_shas(
    repo_path: &str,
    pr_numbers: &[u64],
) -> Result<HashMap<u64, String>, ()> {
    let mut args = vec!["-C", repo_path, "ls-remote", "origin"];
    let refs: Vec<String> = pr_numbers
        .iter()
        .map(|n| format!("refs/pull/{}/head", n))
        .collect();
    let ref_strs: Vec<&str> = refs.iter().map(|s| s.as_str()).collect();
    args.extend_from_slice(&ref_strs);

    let output = silent_command("git")
        .args(&args)
        .output()
        .map_err(|_| ())?;

    if !output.status.success() {
        return Err(());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut map = HashMap::new();
    for line in stdout.lines() {
        // Format: "<sha>\trefs/pull/<N>/head"
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 2 {
            if let Some(rest) = parts[1].strip_prefix("refs/pull/") {
                if let Some(num_str) = rest.strip_suffix("/head") {
                    if let Ok(n) = num_str.parse::<u64>() {
                        map.insert(n, parts[0].to_string());
                    }
                }
            }
        }
    }
    Ok(map)
}

/// Get the HEAD commit SHA of a worktree.
fn get_local_head_sha(worktree_path: &str) -> Option<String> {
    let output = silent_command("git")
        .args(["-C", worktree_path, "rev-parse", "HEAD"])
        .output()
        .ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

fn fetch_pr_meta_lightweight(repo_path: &str, pr_number: u64) -> (String, String, String, String) {
    let output = silent_command("gh")
        .args([
            "pr", "view", &pr_number.to_string(),
            "--json", "title,url,headRefName,baseRefName",
        ])
        .current_dir(repo_path)
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                return (
                    v["title"].as_str().unwrap_or("").to_string(),
                    v["url"].as_str().unwrap_or("").to_string(),
                    v["headRefName"].as_str().unwrap_or("").to_string(),
                    v["baseRefName"].as_str().unwrap_or("").to_string(),
                );
            }
        }
    }
    (String::new(), String::new(), format!("pr/{}", pr_number), String::new())
}
