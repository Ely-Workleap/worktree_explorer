use std::collections::HashMap;
use std::process::Command;

use crate::error::AppError;
use crate::models::PrStatus;

/// Check if `gh` CLI is available.
pub fn is_gh_available() -> bool {
    Command::new("gh")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Get PR status for a single branch.
pub fn get_pr_status(repo_path: &str, branch: &str) -> Option<PrStatus> {
    let output = Command::new("gh")
        .args([
            "pr", "view", branch,
            "--json", "number,title,state,reviewDecision,url,baseRefName,isDraft,statusCheckRollup",
        ])
        .current_dir(repo_path)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let v: serde_json::Value = serde_json::from_str(&json_str).ok()?;

    Some(parse_pr_json(&v))
}

/// Get PR statuses for multiple branches.
pub fn get_pr_statuses_batch(
    repo_path: &str,
    branches: &[String],
) -> HashMap<String, PrStatus> {
    let mut result = HashMap::new();
    for branch in branches {
        if let Some(pr) = get_pr_status(repo_path, branch) {
            result.insert(branch.clone(), pr);
        }
    }
    result
}

/// Create a PR via `gh pr create`.
pub fn create_pr(
    repo_path: &str,
    base: &str,
    head: &str,
    title: &str,
    body: &str,
    is_draft: bool,
) -> Result<PrStatus, AppError> {
    let mut args = vec![
        "pr", "create",
        "--base", base,
        "--head", head,
        "--title", title,
        "--body", body,
    ];
    if is_draft {
        args.push("--draft");
    }

    let output = Command::new("gh")
        .args(&args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to run gh pr create: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::Custom(format!("gh pr create failed: {}", stderr.trim())));
    }

    // Get the created PR details
    get_pr_status(repo_path, head).ok_or_else(|| {
        AppError::Custom("PR created but could not fetch details".to_string())
    })
}

/// Update a PR's base branch via GitHub API.
pub fn update_pr_base(
    repo_path: &str,
    pr_number: u64,
    new_base: &str,
) -> Result<(), AppError> {
    let output = Command::new("gh")
        .args([
            "api",
            "--method", "PATCH",
            &format!("repos/{{owner}}/{{repo}}/pulls/{}", pr_number),
            "-f", &format!("base={}", new_base),
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to update PR base: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::Custom(format!("Failed to update PR #{} base: {}", pr_number, stderr.trim())));
    }

    Ok(())
}

/// Force-push a branch from a worktree.
pub fn force_push_branch(worktree_path: &str, branch: &str) -> Result<(), AppError> {
    let output = Command::new("git")
        .args(["-C", worktree_path, "push", "--force-with-lease", "origin", branch])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to push {}: {}", branch, e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::Custom(format!("Failed to push {}: {}", branch, stderr.trim())));
    }

    Ok(())
}

fn parse_pr_json(v: &serde_json::Value) -> PrStatus {
    let checks = v.get("statusCheckRollup")
        .and_then(|arr| arr.as_array())
        .map(|checks| {
            if checks.iter().any(|c| c.get("conclusion").and_then(|v| v.as_str()) == Some("FAILURE")) {
                "FAILURE".to_string()
            } else if checks.iter().all(|c| c.get("conclusion").and_then(|v| v.as_str()) == Some("SUCCESS")) {
                "SUCCESS".to_string()
            } else {
                "PENDING".to_string()
            }
        });

    PrStatus {
        number: v.get("number").and_then(|v| v.as_u64()).unwrap_or(0),
        title: v.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        state: v.get("state").and_then(|v| v.as_str()).unwrap_or("OPEN").to_string(),
        review_decision: v.get("reviewDecision").and_then(|v| v.as_str()).map(String::from),
        url: v.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        base_branch: v.get("baseRefName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        is_draft: v.get("isDraft").and_then(|v| v.as_bool()).unwrap_or(false),
        checks_status: checks,
    }
}
