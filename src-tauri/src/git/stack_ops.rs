use git2::{Repository, RepositoryState};
use std::collections::HashMap;
use std::process::Command;

use crate::error::AppError;
use crate::git::metadata;
use crate::git::status::get_repo_status;
use crate::git::worktree_ops;
use crate::models::{
    AddToStackRequest, CascadeRebaseResult, CascadeRebaseStep, CreateStackRequest,
    CreateWorktreeRequest, ProgressEvent, StackBranchInfo, StackInfo,
};

/// Create a new stack: creates metadata entry + first branch/worktree.
pub fn create_stack(
    request: &CreateStackRequest,
    on_progress: impl Fn(ProgressEvent),
) -> Result<StackInfo, AppError> {
    // Create the stack in metadata first
    let stack = StackInfo {
        name: request.stack_name.clone(),
        root_branch: request.root_branch.clone(),
        branches: vec![request.initial_branch.clone()],
        pr_numbers: HashMap::new(),
    };
    metadata::create_stack(&request.repo_path, stack.clone())?;

    // Create the worktree for the first branch
    let wt_request = CreateWorktreeRequest {
        repo_path: request.repo_path.clone(),
        name: request.worktree_name.clone(),
        branch: Some(request.initial_branch.clone()),
        create_branch: true,
        base_branch: Some(request.root_branch.clone()),
    };

    match worktree_ops::create_worktree(&wt_request, on_progress) {
        Ok(_) => Ok(stack),
        Err(e) => {
            // Rollback: delete the stack from metadata
            let _ = metadata::delete_stack(&request.repo_path, &request.stack_name);
            Err(e)
        }
    }
}

/// Add a branch to an existing stack, creating a worktree for it.
pub fn add_branch_to_stack(
    request: &AddToStackRequest,
    on_progress: impl Fn(ProgressEvent),
) -> Result<StackInfo, AppError> {
    // Determine the base branch: previous branch in stack, or root_branch if inserting at position 0
    let meta = metadata::read_metadata_v2(&request.repo_path);
    let stack = meta
        .stacks
        .get(&request.stack_name)
        .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", request.stack_name)))?;

    let insert_pos = request.position.unwrap_or(stack.branches.len());
    let base_branch = if insert_pos == 0 {
        stack.root_branch.clone()
    } else {
        let prev_idx = insert_pos.min(stack.branches.len()) - 1;
        stack.branches[prev_idx].clone()
    };

    // Create worktree
    let wt_request = CreateWorktreeRequest {
        repo_path: request.repo_path.clone(),
        name: request.worktree_name.clone(),
        branch: Some(request.branch_name.clone()),
        create_branch: true,
        base_branch: Some(base_branch),
    };

    worktree_ops::create_worktree(&wt_request, on_progress)?;

    // Add to stack metadata
    let updated_stack =
        metadata::add_to_stack(&request.repo_path, &request.stack_name, &request.branch_name, request.position)?;

    // If we inserted in the middle, update the next branch's base_branch
    let new_pos = updated_stack
        .branches
        .iter()
        .position(|b| b == &request.branch_name)
        .unwrap_or(0);
    if new_pos + 1 < updated_stack.branches.len() {
        // The branch after the inserted one should now point to the inserted branch as its base
        let next_branch = &updated_stack.branches[new_pos + 1];
        // Find the worktree for the next branch and update its base
        if let Some(wt_name) = find_worktree_for_branch(&request.repo_path, next_branch) {
            let _ = metadata::save_base_branch(
                &request.repo_path,
                &wt_name,
                &request.branch_name,
            );
        }
    }

    Ok(updated_stack)
}

/// Remove a branch from a stack, optionally deleting the worktree.
pub fn remove_branch_from_stack(
    repo_path: &str,
    stack_name: &str,
    branch: &str,
    delete_worktree: bool,
) -> Result<StackInfo, AppError> {
    let meta = metadata::read_metadata_v2(repo_path);
    let stack = meta
        .stacks
        .get(stack_name)
        .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", stack_name)))?;

    // Find position of branch being removed
    let pos = stack
        .branches
        .iter()
        .position(|b| b == branch)
        .ok_or_else(|| {
            AppError::Custom(format!("Branch '{}' not in stack '{}'", branch, stack_name))
        })?;

    // Determine new base for the branch after the removed one
    let new_base_for_next = if pos == 0 {
        stack.root_branch.clone()
    } else {
        stack.branches[pos - 1].clone()
    };

    // Remove from stack metadata
    let updated_stack = metadata::remove_from_stack(repo_path, stack_name, branch)?;

    // Update the next branch's base if there is one
    if pos < updated_stack.branches.len() {
        let next_branch = &updated_stack.branches[pos];
        if let Some(wt_name) = find_worktree_for_branch(repo_path, next_branch) {
            let _ = metadata::save_base_branch(repo_path, &wt_name, &new_base_for_next);
        }
    }

    // Optionally delete the worktree
    if delete_worktree {
        if let Some(wt_name) = find_worktree_for_branch(repo_path, branch) {
            let _ = worktree_ops::delete_worktree(repo_path, &wt_name);
        }
    }

    Ok(updated_stack)
}

/// Delete an entire stack, optionally deleting all worktrees.
pub fn delete_stack(
    repo_path: &str,
    stack_name: &str,
    delete_worktrees: bool,
) -> Result<(), AppError> {
    if delete_worktrees {
        let meta = metadata::read_metadata_v2(repo_path);
        if let Some(stack) = meta.stacks.get(stack_name) {
            for branch in &stack.branches {
                if let Some(wt_name) = find_worktree_for_branch(repo_path, branch) {
                    let _ = worktree_ops::delete_worktree(repo_path, &wt_name);
                }
            }
        }
    }
    metadata::delete_stack(repo_path, stack_name)
}

/// Get detailed status for each branch in a stack.
pub fn get_stack_details(
    repo_path: &str,
    stack_name: &str,
) -> Result<Vec<StackBranchInfo>, AppError> {
    let meta = metadata::read_metadata_v2(repo_path);
    let stack = meta
        .stacks
        .get(stack_name)
        .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", stack_name)))?;

    let mut details = Vec::new();

    for (position, branch) in stack.branches.iter().enumerate() {
        let pr_number = stack
            .pr_numbers
            .get(branch)
            .copied()
            .flatten();

        // Try to find the worktree for this branch
        let wt_info = find_worktree_info_for_branch(repo_path, branch);

        let (worktree_name, worktree_path, is_dirty, is_rebasing, ahead, behind, file_changes) =
            match wt_info {
                Some((name, path, dirty, rebasing, a, b, fc)) => {
                    (Some(name), Some(path), dirty, rebasing, a, b, fc)
                }
                None => (None, None, false, false, 0, 0, 0),
            };

        details.push(StackBranchInfo {
            branch: branch.clone(),
            worktree_name,
            worktree_path,
            pr_number,
            is_dirty,
            is_rebasing,
            ahead,
            behind,
            file_changes,
            position,
        });
    }

    Ok(details)
}

/// Cascade rebase: rebase each branch in the stack onto its predecessor.
pub fn cascade_rebase(
    repo_path: &str,
    stack_name: &str,
    on_progress: impl Fn(ProgressEvent),
) -> Result<CascadeRebaseResult, AppError> {
    let meta = metadata::read_metadata_v2(repo_path);
    let stack = meta
        .stacks
        .get(stack_name)
        .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", stack_name)))?
        .clone();

    let total = stack.branches.len() + 1; // +1 for fetch step

    // Step 1: Fetch the root branch
    on_progress(ProgressEvent {
        step: 1,
        total,
        message: format!("Fetching origin/{}...", stack.root_branch),
    });

    let _ = Command::new("git")
        .args(["-C", repo_path, "fetch", "origin", &stack.root_branch])
        .output();

    let mut results = Vec::new();
    let mut stopped_at = None;

    // Step 2: Rebase each branch in order (bottom to top)
    for (i, branch) in stack.branches.iter().enumerate() {
        on_progress(ProgressEvent {
            step: i + 2,
            total,
            message: format!("Rebasing {}...", branch),
        });

        // Determine onto_ref and old_base_ref
        let onto_ref = if i == 0 {
            format!("origin/{}", stack.root_branch)
        } else {
            stack.branches[i - 1].clone()
        };

        let old_base_ref = if i == 0 {
            stack.root_branch.clone()
        } else {
            stack.branches[i - 1].clone()
        };

        // Find worktree path for this branch
        let wt_path = match find_worktree_path_for_branch(repo_path, branch) {
            Some(p) => p,
            None => {
                results.push(CascadeRebaseStep {
                    branch: branch.clone(),
                    success: false,
                    has_conflicts: false,
                    message: format!("No worktree found for branch '{}'", branch),
                });
                stopped_at = Some(branch.clone());
                break;
            }
        };

        let result = worktree_ops::rebase_onto(&wt_path, &onto_ref, &old_base_ref)?;

        let step = CascadeRebaseStep {
            branch: branch.clone(),
            success: result.success,
            has_conflicts: result.has_conflicts,
            message: result.message,
        };

        if !result.success {
            stopped_at = Some(branch.clone());
            results.push(step);
            break;
        }

        results.push(step);
    }

    Ok(CascadeRebaseResult {
        results,
        stopped_at,
    })
}

/// Find the worktree path for a given branch.
fn find_worktree_path_for_branch(repo_path: &str, branch: &str) -> Option<String> {
    let repo = Repository::open(repo_path).ok()?;
    let worktrees = repo.worktrees().ok()?;
    for name in worktrees.iter().flatten() {
        let wt = match repo.find_worktree(name) {
            Ok(wt) => wt,
            Err(_) => continue,
        };
        let wt_path = wt.path().to_string_lossy().to_string();
        if let Ok(wt_repo) = Repository::open(&wt_path) {
            if let Ok(head) = wt_repo.head() {
                if head.shorthand() == Some(branch) {
                    return Some(wt_path);
                }
            }
        }
    }
    None
}

/// Find the worktree name for a given branch by scanning all worktrees.
fn find_worktree_for_branch(repo_path: &str, branch: &str) -> Option<String> {
    let repo = Repository::open(repo_path).ok()?;
    let worktrees = repo.worktrees().ok()?;
    for name in worktrees.iter().flatten() {
        let wt = match repo.find_worktree(name) {
            Ok(wt) => wt,
            Err(_) => continue,
        };
        let wt_path = wt.path().to_string_lossy().to_string();
        if let Ok(wt_repo) = Repository::open(&wt_path) {
            if let Ok(head) = wt_repo.head() {
                if head.shorthand() == Some(branch) {
                    return Some(name.to_string());
                }
            }
        }
    }
    None
}

/// Find worktree info (name, path, status) for a given branch.
fn find_worktree_info_for_branch(
    repo_path: &str,
    branch: &str,
) -> Option<(String, String, bool, bool, usize, usize, usize)> {
    let repo = Repository::open(repo_path).ok()?;
    let worktrees = repo.worktrees().ok()?;
    for name in worktrees.iter().flatten() {
        let wt = match repo.find_worktree(name) {
            Ok(wt) => wt,
            Err(_) => continue,
        };
        let wt_path = wt.path().to_string_lossy().to_string();
        if let Ok(wt_repo) = Repository::open(&wt_path) {
            if let Ok(head) = wt_repo.head() {
                if head.shorthand() == Some(branch) {
                    let is_rebasing = matches!(
                        wt_repo.state(),
                        RepositoryState::Rebase
                            | RepositoryState::RebaseMerge
                            | RepositoryState::RebaseInteractive
                    );
                    let status = get_repo_status(&wt_repo).unwrap_or(crate::git::status::RepoStatus {
                        is_dirty: false,
                        file_changes: 0,
                        ahead: 0,
                        behind: 0,
                    });
                    return Some((
                        name.to_string(),
                        wt_path,
                        status.is_dirty,
                        is_rebasing,
                        status.ahead,
                        status.behind,
                        status.file_changes,
                    ));
                }
            }
        }
    }
    None
}
