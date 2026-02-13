use git2::Repository;
use std::path::PathBuf;
use std::process::Command;

use crate::error::AppError;
use crate::git::metadata;
use crate::git::status::get_repo_status;
use crate::models::{CreateWorktreeRequest, MergeResult, WorktreeInfo};

pub fn list_worktrees(repo_path: &str) -> Result<Vec<WorktreeInfo>, AppError> {
    let repo = Repository::open(repo_path)?;
    let meta = metadata::read_metadata(repo_path);
    let mut result = Vec::new();

    // Add main worktree
    let main_status = get_repo_status(&repo)?;
    let main_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from));

    result.push(WorktreeInfo {
        name: "main".to_string(),
        path: repo_path.to_string(),
        branch: main_branch,
        base_branch: None,
        is_main: true,
        is_dirty: main_status.is_dirty,
        is_locked: false,
        ahead: main_status.ahead,
        behind: main_status.behind,
        file_changes: main_status.file_changes,
    });

    // Add linked worktrees
    let worktrees = repo.worktrees()?;
    for name in worktrees.iter() {
        let name = match name {
            Some(n) => n,
            None => continue,
        };

        let wt = match repo.find_worktree(name) {
            Ok(wt) => wt,
            Err(_) => continue,
        };

        let wt_path = wt.path().to_string_lossy().to_string();
        let is_locked = wt.is_locked().map(|s| !matches!(s, git2::WorktreeLockStatus::Unlocked)).unwrap_or(false);

        // Open the worktree's repo to get status
        let (branch, is_dirty, ahead, behind, file_changes) =
            match Repository::open(&wt_path) {
                Ok(wt_repo) => {
                    let branch = wt_repo
                        .head()
                        .ok()
                        .and_then(|h| h.shorthand().map(String::from));
                    let status = get_repo_status(&wt_repo).unwrap_or_else(|_| {
                        crate::git::status::RepoStatus {
                            is_dirty: false,
                            file_changes: 0,
                            ahead: 0,
                            behind: 0,
                        }
                    });
                    (
                        branch,
                        status.is_dirty,
                        status.ahead,
                        status.behind,
                        status.file_changes,
                    )
                }
                Err(_) => (None, false, 0, 0, 0),
            };

        let base_branch = meta.get(name).cloned();

        result.push(WorktreeInfo {
            name: name.to_string(),
            path: wt_path,
            branch,
            base_branch,
            is_main: false,
            is_dirty,
            is_locked,
            ahead,
            behind,
            file_changes,
        });
    }

    Ok(result)
}

pub fn create_worktree(request: &CreateWorktreeRequest) -> Result<WorktreeInfo, AppError> {
    let repo = Repository::open(&request.repo_path)?;

    // Determine worktree path: sibling directory to the repo
    let repo_parent = PathBuf::from(&request.repo_path)
        .parent()
        .ok_or_else(|| AppError::Custom("Cannot determine parent directory".to_string()))?
        .to_path_buf();
    let wt_path = repo_parent.join(&request.name);

    if wt_path.exists() {
        return Err(AppError::Custom(format!(
            "Directory already exists: {}",
            wt_path.display()
        )));
    }

    let branch_name = request
        .branch
        .as_deref()
        .ok_or_else(|| AppError::Custom("Branch name is required".to_string()))?;

    // Determine the base branch to save in metadata
    let effective_base_branch = if request.create_branch {
        if let Some(base) = &request.base_branch {
            Some(base.clone())
        } else {
            // Default to HEAD branch name
            repo.head()
                .ok()
                .and_then(|h| h.shorthand().map(String::from))
        }
    } else {
        None
    };

    if request.create_branch {
        // Resolve the base commit: use base_branch if provided, otherwise HEAD
        let commit = if let Some(base) = &request.base_branch {
            let base_ref_name = format!("refs/heads/{}", base);
            let reference = repo.find_reference(&base_ref_name).map_err(|_| {
                AppError::Custom(format!("Base branch '{}' not found", base))
            })?;
            reference.peel_to_commit()?
        } else {
            repo.head()?.peel_to_commit()?
        };
        let branch = repo.branch(branch_name, &commit, false)?;
        let branch_ref = branch
            .into_reference()
            .name()
            .ok_or_else(|| AppError::Custom("Invalid branch reference".to_string()))?
            .to_string();

        repo.worktree(
            &request.name,
            &wt_path,
            Some(
                git2::WorktreeAddOptions::new()
                    .reference(Some(&repo.find_reference(&branch_ref)?)),
            ),
        )?;
    } else {
        // Use existing branch
        let branch_ref_name = format!("refs/heads/{}", branch_name);
        let reference = repo.find_reference(&branch_ref_name).map_err(|_| {
            AppError::Custom(format!("Branch '{}' not found", branch_name))
        })?;

        repo.worktree(
            &request.name,
            &wt_path,
            Some(git2::WorktreeAddOptions::new().reference(Some(&reference))),
        )?;
    }

    // Save base branch metadata
    if let Some(base) = &effective_base_branch {
        let _ = metadata::save_base_branch(&request.repo_path, &request.name, base);
    }

    // Return info about the new worktree
    let wt_repo = Repository::open(&wt_path)?;
    let branch = wt_repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from));
    let status = get_repo_status(&wt_repo)?;

    Ok(WorktreeInfo {
        name: request.name.clone(),
        path: wt_path.to_string_lossy().to_string(),
        branch,
        base_branch: effective_base_branch,
        is_main: false,
        is_dirty: status.is_dirty,
        is_locked: false,
        ahead: status.ahead,
        behind: status.behind,
        file_changes: status.file_changes,
    })
}

pub fn delete_worktree(repo_path: &str, worktree_name: &str) -> Result<(), AppError> {
    let repo = Repository::open(repo_path)?;

    // Find the worktree to get its path
    let wt = repo.find_worktree(worktree_name)?;
    let wt_path = wt.path().to_path_buf();

    // If locked, unlock first
    if wt.is_locked().map(|s| !matches!(s, git2::WorktreeLockStatus::Unlocked)).unwrap_or(false) {
        wt.unlock()?;
    }

    // Prune the worktree
    wt.prune(Some(
        git2::WorktreePruneOptions::new()
            .valid(true)
            .working_tree(true),
    ))?;

    // Remove the directory
    if wt_path.exists() {
        std::fs::remove_dir_all(&wt_path)?;
    }

    // Clean up metadata
    let _ = metadata::remove_worktree_meta(repo_path, worktree_name);

    Ok(())
}

pub fn rebase_onto_master(_repo_path: &str, worktree_path: &str, base_branch: &str) -> Result<MergeResult, AppError> {
    // Step 1: Find the merge-base SHA between base_branch and HEAD
    let merge_base_output = Command::new("git")
        .args(["-C", worktree_path, "merge-base", base_branch, "HEAD"])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to run git merge-base: {}", e)))?;

    if !merge_base_output.status.success() {
        let stderr = String::from_utf8_lossy(&merge_base_output.stderr).to_string();
        return Ok(MergeResult {
            success: false,
            message: format!("Could not find merge-base between '{}' and HEAD: {}", base_branch, stderr.trim()),
        });
    }

    let merge_base_sha = String::from_utf8_lossy(&merge_base_output.stdout).trim().to_string();
    if merge_base_sha.is_empty() {
        return Ok(MergeResult {
            success: false,
            message: format!("No common ancestor found between '{}' and HEAD.", base_branch),
        });
    }

    // Step 2: Get current branch name
    let branch_output = Command::new("git")
        .args(["-C", worktree_path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to get current branch: {}", e)))?;

    let current_branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    // Step 3: git rebase --onto master <merge_base_sha> <current_branch>
    let output = Command::new("git")
        .args(["-C", worktree_path, "rebase", "--onto", "master", &merge_base_sha, &current_branch])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to run git rebase: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(MergeResult {
            success: true,
            message: if stdout.trim().is_empty() {
                "Rebase completed successfully.".to_string()
            } else {
                stdout.trim().to_string()
            },
        })
    } else {
        let message = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            "Rebase failed with unknown error.".to_string()
        };

        Ok(MergeResult {
            success: false,
            message,
        })
    }
}

pub fn merge_base_branch(_repo_path: &str, worktree_path: &str, base_branch: &str) -> Result<MergeResult, AppError> {
    // Shell out to git merge for robustness (handles conflicts, hooks, etc.)
    let output = Command::new("git")
        .args(["-C", worktree_path, "merge", base_branch])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to run git merge: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(MergeResult {
            success: true,
            message: if stdout.trim().is_empty() {
                "Merge completed successfully.".to_string()
            } else {
                stdout.trim().to_string()
            },
        })
    } else {
        // Merge failed (conflicts or other error)
        let message = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            "Merge failed with unknown error.".to_string()
        };

        Ok(MergeResult {
            success: false,
            message,
        })
    }
}
