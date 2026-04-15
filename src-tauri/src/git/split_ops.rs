use std::collections::HashMap;
use std::path::PathBuf;

use crate::util::silent_command;

use git2::Repository;

use crate::error::AppError;
use crate::git::metadata::{self, WorktreeEntry};
use crate::models::{ProgressEvent, SplitPlan, SplitResult, StackInfo};

/// Execute a split plan: create branches, worktrees, and populate each with
/// the designated commits (cherry-pick) or files (checkout from source).
/// Rolls back all created worktrees and branches on failure.
pub fn execute_split_plan(
    plan: &SplitPlan,
    on_progress: impl Fn(ProgressEvent),
) -> Result<SplitResult, AppError> {
    let repo = Repository::open(&plan.repo_path)?;
    let repo_parent = PathBuf::from(&plan.repo_path)
        .parent()
        .ok_or_else(|| AppError::Custom("Cannot determine repo parent directory".into()))?
        .to_path_buf();

    let total = plan.groups.len() + 2; // +1 backup, +1 metadata
    let mut step = 0;
    let mut emit = |msg: &str| {
        step += 1;
        on_progress(ProgressEvent {
            step,
            total,
            message: msg.to_string(),
        });
    };

    // --- Validation ---
    if plan.groups.is_empty() {
        return Err(AppError::Custom("Split plan has no groups".into()));
    }
    for group in &plan.groups {
        if group.commits.is_empty() && group.files.is_empty() {
            return Err(AppError::Custom(format!(
                "Group '{}' has neither commits nor files",
                group.branch_name
            )));
        }
        let wt_path = repo_parent.join(&group.worktree_name);
        if wt_path.exists() {
            return Err(AppError::Custom(format!(
                "Directory already exists: {}",
                wt_path.display()
            )));
        }
        // Check branch name collision
        let branch_ref = format!("refs/heads/{}", group.branch_name);
        if repo.find_reference(&branch_ref).is_ok() {
            return Err(AppError::Custom(format!(
                "Branch '{}' already exists",
                group.branch_name
            )));
        }
    }
    // Check root branch exists
    let root_ref = format!("refs/heads/{}", plan.root_branch);
    let remote_root_ref = format!("refs/remotes/origin/{}", plan.root_branch);
    if repo.find_reference(&root_ref).is_err() && repo.find_reference(&remote_root_ref).is_err() {
        return Err(AppError::Custom(format!(
            "Root branch '{}' not found",
            plan.root_branch
        )));
    }
    // Check stack name collision
    let meta = metadata::read_metadata_v2(&plan.repo_path);
    if meta.stacks.contains_key(&plan.stack_name) {
        return Err(AppError::Custom(format!(
            "Stack '{}' already exists",
            plan.stack_name
        )));
    }

    // --- Step 1: Create safety backup branch ---
    let backup_branch = format!("backup/{}", plan.source_branch);
    emit(&format!("Creating backup branch '{}'...", backup_branch));

    let source_ref = format!("refs/heads/{}", plan.source_branch);
    let source_commit = repo
        .find_reference(&source_ref)
        .map_err(|_| {
            AppError::Custom(format!("Source branch '{}' not found", plan.source_branch))
        })?
        .peel_to_commit()
        .map_err(|e| AppError::Custom(format!("Cannot resolve source branch: {}", e)))?;

    // Delete existing backup branch if present (idempotent)
    let backup_ref = format!("refs/heads/{}", backup_branch);
    if repo.find_reference(&backup_ref).is_ok() {
        let _ = repo.find_reference(&backup_ref).and_then(|mut r| r.delete());
    }
    repo.branch(&backup_branch, &source_commit, false)
        .map_err(|e| AppError::Custom(format!("Failed to create backup branch: {}", e)))?;

    // --- Step 2: Create branches + worktrees + populate ---
    let mut created_branches: Vec<String> = Vec::new();
    let mut created_worktrees: Vec<String> = Vec::new();

    let rollback = |branches: &[String], worktrees: &[String], repo_path: &str| {
        // Remove worktrees first
        for wt_name in worktrees.iter().rev() {
            let _ = silent_command("git")
                .args(["-C", repo_path, "worktree", "remove", "--force", wt_name])
                .output();
        }
        // Remove branches
        if let Ok(repo) = Repository::open(repo_path) {
            for branch_name in branches.iter().rev() {
                if let Ok(mut branch) = repo.find_branch(branch_name, git2::BranchType::Local) {
                    let _ = branch.delete();
                }
            }
        }
    };

    for (i, group) in plan.groups.iter().enumerate() {
        emit(&format!(
            "Creating branch '{}' ({}/{})...",
            group.branch_name,
            i + 1,
            plan.groups.len()
        ));

        // Determine base for this group
        let base_branch = if i == 0 {
            plan.root_branch.clone()
        } else {
            plan.groups[i - 1].branch_name.clone()
        };

        // Resolve base commit
        let base_commit = {
            let remote_ref = format!("refs/remotes/origin/{}", base_branch);
            let local_ref = format!("refs/heads/{}", base_branch);
            repo.find_reference(&remote_ref)
                .or_else(|_| repo.find_reference(&local_ref))
                .map_err(|_| {
                    rollback(&created_branches, &created_worktrees, &plan.repo_path);
                    AppError::Custom(format!("Base branch '{}' not found", base_branch))
                })?
                .peel_to_commit()
                .map_err(|e| {
                    rollback(&created_branches, &created_worktrees, &plan.repo_path);
                    AppError::Custom(format!("Cannot resolve base branch '{}': {}", base_branch, e))
                })?
        };

        // Create branch from base
        repo.branch(&group.branch_name, &base_commit, false)
            .map_err(|e| {
                rollback(&created_branches, &created_worktrees, &plan.repo_path);
                AppError::Custom(format!(
                    "Failed to create branch '{}': {}",
                    group.branch_name, e
                ))
            })?;
        created_branches.push(group.branch_name.clone());

        // Create worktree
        let wt_path = repo_parent.join(&group.worktree_name);
        let branch_ref_name = format!("refs/heads/{}", group.branch_name);
        let branch_ref = repo.find_reference(&branch_ref_name).map_err(|e| {
            rollback(&created_branches, &created_worktrees, &plan.repo_path);
            AppError::Custom(format!("Cannot find branch ref: {}", e))
        })?;

        repo.worktree(
            &group.worktree_name,
            &wt_path,
            Some(git2::WorktreeAddOptions::new().reference(Some(&branch_ref))),
        )
        .map_err(|e| {
            rollback(&created_branches, &created_worktrees, &plan.repo_path);
            AppError::Custom(format!(
                "Failed to create worktree '{}': {}",
                group.worktree_name, e
            ))
        })?;
        created_worktrees.push(group.worktree_name.clone());

        let wt_path_str = wt_path.to_string_lossy().to_string();

        // Populate the worktree
        if !group.commits.is_empty() {
            // Scenario A: cherry-pick commits
            for sha in &group.commits {
                let output = silent_command("git")
                    .args(["-C", &wt_path_str, "cherry-pick", sha])
                    .output()
                    .map_err(|e| {
                        rollback(&created_branches, &created_worktrees, &plan.repo_path);
                        AppError::Custom(format!("Failed to run cherry-pick: {}", e))
                    })?;

                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    rollback(&created_branches, &created_worktrees, &plan.repo_path);
                    return Err(AppError::Custom(format!(
                        "Cherry-pick of {} failed in '{}': {}",
                        sha,
                        group.branch_name,
                        stderr.trim()
                    )));
                }
            }
        } else if !group.files.is_empty() {
            // Scenario B: checkout files from source branch, then commit
            let mut checkout_args = vec![
                "-C".to_string(),
                wt_path_str.clone(),
                "checkout".to_string(),
                plan.source_branch.clone(),
                "--".to_string(),
            ];
            checkout_args.extend(group.files.clone());

            let output = silent_command("git")
                .args(&checkout_args)
                .output()
                .map_err(|e| {
                    rollback(&created_branches, &created_worktrees, &plan.repo_path);
                    AppError::Custom(format!("Failed to run git checkout: {}", e))
                })?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                rollback(&created_branches, &created_worktrees, &plan.repo_path);
                return Err(AppError::Custom(format!(
                    "File checkout failed for '{}': {}",
                    group.branch_name,
                    stderr.trim()
                )));
            }

            // Stage all changes
            let add_output = silent_command("git")
                .args(["-C", &wt_path_str, "add", "-A"])
                .output()
                .map_err(|e| {
                    rollback(&created_branches, &created_worktrees, &plan.repo_path);
                    AppError::Custom(format!("Failed to run git add: {}", e))
                })?;

            if !add_output.status.success() {
                let stderr = String::from_utf8_lossy(&add_output.stderr).to_string();
                rollback(&created_branches, &created_worktrees, &plan.repo_path);
                return Err(AppError::Custom(format!(
                    "git add failed for '{}': {}",
                    group.branch_name,
                    stderr.trim()
                )));
            }

            // Commit
            let commit_output = silent_command("git")
                .args(["-C", &wt_path_str, "commit", "-m", &group.description])
                .output()
                .map_err(|e| {
                    rollback(&created_branches, &created_worktrees, &plan.repo_path);
                    AppError::Custom(format!("Failed to run git commit: {}", e))
                })?;

            if !commit_output.status.success() {
                let stderr = String::from_utf8_lossy(&commit_output.stderr).to_string();
                // "nothing to commit" is not a fatal error if files were already identical
                if !stderr.contains("nothing to commit") {
                    rollback(&created_branches, &created_worktrees, &plan.repo_path);
                    return Err(AppError::Custom(format!(
                        "git commit failed for '{}': {}",
                        group.branch_name,
                        stderr.trim()
                    )));
                }
            }
        }
    }

    // --- Step 3: Update metadata ---
    emit("Updating stack metadata...");

    let mut meta = metadata::read_metadata_v2(&plan.repo_path);

    // Add worktree entries with correct base branches
    for (i, group) in plan.groups.iter().enumerate() {
        let base = if i == 0 {
            plan.root_branch.clone()
        } else {
            plan.groups[i - 1].branch_name.clone()
        };
        meta.worktrees.insert(
            group.worktree_name.clone(),
            WorktreeEntry {
                base_branch: base,
            },
        );
    }

    // Create stack entry
    let stack = StackInfo {
        name: plan.stack_name.clone(),
        root_branch: plan.root_branch.clone(),
        branches: plan.groups.iter().map(|g| g.branch_name.clone()).collect(),
        pr_numbers: HashMap::new(),
    };
    meta.stacks.insert(plan.stack_name.clone(), stack.clone());

    metadata::write_metadata_v2(&plan.repo_path, &meta)?;

    Ok(SplitResult {
        stack,
        branches_created: created_branches,
        worktrees_created: created_worktrees,
        backup_branch,
    })
}
