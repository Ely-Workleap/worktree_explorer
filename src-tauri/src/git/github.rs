use std::collections::HashMap;

use crate::error::AppError;
use crate::util::silent_command;
use crate::models::PrStatus;

/// Check if `gh` CLI is available.
pub fn is_gh_available() -> bool {
    silent_command("gh")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Get PR status for a single branch.
pub fn get_pr_status(repo_path: &str, branch: &str) -> Option<PrStatus> {
    let output = silent_command("gh")
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

    let output = silent_command("gh")
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
    let output = silent_command("gh")
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
    let output = silent_command("git")
        .args(["-C", worktree_path, "push", "--force-with-lease", "origin", branch])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to push {}: {}", branch, e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::Custom(format!("Failed to push {}: {}", branch, stderr.trim())));
    }

    Ok(())
}

/// Fetch a PR's metadata, create a local branch `pr/<number>` from the GitHub ref,
/// and add a git worktree as a sibling of repo_path.
/// Idempotent: if the worktree directory already exists, returns existing info.
pub fn checkout_pr(repo_path: &str, pr_number: u64) -> Result<crate::models::PrWorktreeInfo, AppError> {
    use std::path::PathBuf;

    // 1. Fetch PR metadata
    let meta_output = silent_command("gh")
        .args([
            "pr", "view", &pr_number.to_string(),
            "--json", "number,title,url,headRefName,baseRefName",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::Custom(format!("gh pr view failed: {}", e)))?;

    if !meta_output.status.success() {
        let stderr = String::from_utf8_lossy(&meta_output.stderr);
        return Err(AppError::Custom(format!("gh pr view #{}: {}", pr_number, stderr.trim())));
    }

    let v: serde_json::Value = serde_json::from_slice(&meta_output.stdout)
        .map_err(|e| AppError::Custom(format!("Failed to parse PR metadata: {}", e)))?;

    let title       = v["title"].as_str().unwrap_or("").to_string();
    let url         = v["url"].as_str().unwrap_or("").to_string();
    let head_branch = v["headRefName"].as_str().unwrap_or("").to_string();
    let base_branch = v["baseRefName"].as_str().unwrap_or("").to_string();

    let local_branch = format!("pr/{}", pr_number);
    let worktree_name = format!("pr-{}", pr_number);

    // Check if this branch is already checked out in ANY existing worktree.
    // git won't allow two worktrees on the same branch, so we must detect this
    // before calling `git worktree add` — regardless of what the directory is named.
    if let Ok(existing) = crate::git::worktree_ops::list_worktrees(repo_path) {
        if let Some(wt) = existing.iter().find(|w| w.branch.as_deref() == Some(&local_branch)) {
            return Ok(crate::models::PrWorktreeInfo {
                pr_number,
                title,
                url,
                head_branch,
                base_branch,
                worktree_path: wt.path.clone(),
                worktree_name: wt.name.clone(),
                is_up_to_date: None, // not checked on re-use
            });
        }
    }

    let repo_parent = PathBuf::from(repo_path)
        .parent()
        .ok_or_else(|| AppError::Custom("Cannot determine repo parent directory".to_string()))?
        .to_path_buf();
    let wt_path = repo_parent.join(&worktree_name);
    let wt_path_str = wt_path.to_string_lossy().to_string();

    // 2. Fetch the PR ref without touching HEAD
    let fetch_refspec = format!("refs/pull/{}/head:{}", pr_number, local_branch);
    let fetch_output = silent_command("git")
        .args(["-C", repo_path, "fetch", "origin", &fetch_refspec])
        .output()
        .map_err(|e| AppError::Custom(format!("git fetch failed: {}", e)))?;

    if !fetch_output.status.success() {
        let stderr = String::from_utf8_lossy(&fetch_output.stderr);
        return Err(AppError::Custom(format!("Failed to fetch PR #{}: {}", pr_number, stderr.trim())));
    }

    // 3. Add the worktree
    let add_output = silent_command("git")
        .args(["-C", repo_path, "worktree", "add", &wt_path_str, &local_branch])
        .output()
        .map_err(|e| AppError::Custom(format!("git worktree add failed: {}", e)))?;

    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr);
        return Err(AppError::Custom(format!("git worktree add failed: {}", stderr.trim())));
    }

    Ok(crate::models::PrWorktreeInfo {
        pr_number,
        title,
        url,
        head_branch,
        base_branch,
        worktree_path: wt_path_str,
        worktree_name,
        is_up_to_date: Some(true), // just fetched, always up to date
    })
}

/// Pull the latest changes for a PR worktree.
/// Re-fetches `refs/pull/<N>/head` from the worktree dir (so FETCH_HEAD lands
/// in the worktree's own gitdir), then resets the branch to match.
pub fn pull_pr(_repo_path: &str, worktree_path: &str, pr_number: u64) -> Result<(), AppError> {
    let local_branch = format!("pr/{}", pr_number);

    // 1. Fetch the latest PR head — run from the *worktree* so FETCH_HEAD is
    //    written to its gitdir, not the main repo's.
    let fetch_output = silent_command("git")
        .args([
            "-C", worktree_path,
            "fetch", "origin",
            &format!("refs/pull/{}/head", pr_number),
        ])
        .output()
        .map_err(|e| AppError::Custom(format!("git fetch failed: {}", e)))?;

    if !fetch_output.status.success() {
        let stderr = String::from_utf8_lossy(&fetch_output.stderr);
        return Err(AppError::Custom(format!(
            "Failed to fetch PR #{}: {}", pr_number, stderr.trim()
        )));
    }

    // 2. Reset the worktree's branch to FETCH_HEAD
    let reset_output = silent_command("git")
        .args(["-C", worktree_path, "reset", "--hard", "FETCH_HEAD"])
        .output()
        .map_err(|e| AppError::Custom(format!("git reset failed: {}", e)))?;

    if !reset_output.status.success() {
        let stderr = String::from_utf8_lossy(&reset_output.stderr);
        return Err(AppError::Custom(format!(
            "Failed to reset {} to latest: {}", local_branch, stderr.trim()
        )));
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
