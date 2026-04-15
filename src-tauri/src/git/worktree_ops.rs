use git2::{Repository, RepositoryState};
use std::path::PathBuf;

use crate::util::silent_command;
use std::time::UNIX_EPOCH;

use crate::error::AppError;
use crate::git::metadata;
use crate::git::status::get_repo_status;
use crate::models::{CreateWorktreeRequest, MergeResult, ProgressEvent, WorktreeInfo};

fn get_dir_created_at(path: &str) -> Option<i64> {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.created().ok())
        .map(|t| t.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
}

fn is_repo_rebasing(state: RepositoryState) -> bool {
    matches!(
        state,
        RepositoryState::Rebase
            | RepositoryState::RebaseMerge
            | RepositoryState::RebaseInteractive
    )
}

pub fn list_worktrees(repo_path: &str) -> Result<Vec<WorktreeInfo>, AppError> {
    let repo = Repository::open(repo_path)?;
    let meta = metadata::read_metadata_v2(repo_path);
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
        stack_name: None,
        is_main: true,
        is_dirty: main_status.is_dirty,
        is_locked: false,
        is_rebasing: is_repo_rebasing(repo.state()),
        ahead: main_status.ahead,
        behind: main_status.behind,
        file_changes: main_status.file_changes,
        created_at: get_dir_created_at(repo_path),
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
        let (branch, is_dirty, is_rebasing, ahead, behind, file_changes) =
            match Repository::open(&wt_path) {
                Ok(wt_repo) => {
                    let branch = wt_repo
                        .head()
                        .ok()
                        .and_then(|h| h.shorthand().map(String::from));
                    let rebasing = is_repo_rebasing(wt_repo.state());
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
                        rebasing,
                        status.ahead,
                        status.behind,
                        status.file_changes,
                    )
                }
                Err(_) => (None, false, false, 0, 0, 0),
            };

        let base_branch = metadata::get_base_branch(&meta, name);
        let stack_name = branch
            .as_deref()
            .and_then(|b| metadata::find_stack_for_branch(&meta, b));

        let created_at = get_dir_created_at(&wt_path);

        result.push(WorktreeInfo {
            name: name.to_string(),
            path: wt_path,
            branch,
            base_branch,
            stack_name,
            is_main: false,
            is_dirty,
            is_locked,
            is_rebasing,
            ahead,
            behind,
            file_changes,
            created_at,
        });
    }

    Ok(result)
}

pub fn create_worktree(
    request: &CreateWorktreeRequest,
    on_progress: impl Fn(ProgressEvent),
) -> Result<WorktreeInfo, AppError> {
    let total = if request.create_branch && request.base_branch.is_some() { 5 } else { 4 };
    let mut step = 0;

    let mut emit = |msg: &str| {
        step += 1;
        on_progress(ProgressEvent {
            step,
            total,
            message: msg.to_string(),
        });
    };

    emit("Opening repository...");
    let repo = Repository::open(&request.repo_path)?;

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

    let effective_base_branch = if request.create_branch {
        if let Some(base) = &request.base_branch {
            Some(base.clone())
        } else {
            repo.head()
                .ok()
                .and_then(|h| h.shorthand().map(String::from))
        }
    } else {
        None
    };

    if request.create_branch {
        if let Some(base) = &request.base_branch {
            emit(&format!("Fetching latest {}...", base));
            // Strip "origin/" prefix for git fetch (fetch takes the branch name, not the remote ref)
            let fetch_branch = base.strip_prefix("origin/").unwrap_or(base.as_str());
            let _ = silent_command("git")
                .args(["-C", &request.repo_path, "fetch", "origin", fetch_branch])
                .output();
        }

        // Check if the branch already exists
        let branch_ref_name = format!("refs/heads/{}", branch_name);
        let branch_ref = if repo.find_reference(&branch_ref_name).is_ok() {
            // Branch already exists, reuse it
            emit(&format!("Using existing branch {}...", branch_name));
            branch_ref_name
        } else {
            emit(&format!("Creating branch {}...", branch_name));
            let commit = if let Some(base) = &request.base_branch {
                // If base already has "origin/" prefix, look up refs/remotes/<base> directly.
                // Otherwise try refs/remotes/origin/<base> then refs/heads/<base>.
                let reference = if base.starts_with("origin/") {
                    let direct = format!("refs/remotes/{}", base);
                    repo.find_reference(&direct)
                        .or_else(|_| repo.find_reference(&format!("refs/heads/{}", base)))
                } else {
                    let remote_ref = format!("refs/remotes/origin/{}", base);
                    let local_ref = format!("refs/heads/{}", base);
                    repo.find_reference(&remote_ref)
                        .or_else(|_| repo.find_reference(&local_ref))
                }.map_err(|_| {
                    AppError::Custom(format!("Base branch '{}' not found", base))
                })?;
                reference.peel_to_commit()?
            } else {
                repo.head()?.peel_to_commit()?
            };
            let branch = repo.branch(branch_name, &commit, false)?;
            branch
                .into_reference()
                .name()
                .ok_or_else(|| AppError::Custom("Invalid branch reference".to_string()))?
                .to_string()
        };

        emit("Checking out worktree...");
        repo.worktree(
            &request.name,
            &wt_path,
            Some(
                git2::WorktreeAddOptions::new()
                    .reference(Some(&repo.find_reference(&branch_ref)?)),
            ),
        )?;
    } else {
        emit(&format!("Resolving branch {}...", branch_name));

        // Check if it's a local branch first
        let local_ref = format!("refs/heads/{}", branch_name);
        let branch_ref = if repo.find_reference(&local_ref).is_ok() {
            local_ref
        } else {
            // Try as a remote branch (e.g. "origin/feature-x")
            let remote_ref = if branch_name.contains('/') {
                format!("refs/remotes/{}", branch_name)
            } else {
                format!("refs/remotes/origin/{}", branch_name)
            };
            let remote_reference = repo.find_reference(&remote_ref).map_err(|_| {
                AppError::Custom(format!("Branch '{}' not found", branch_name))
            })?;

            // Create a local tracking branch from the remote
            let local_name = if let Some(stripped) = branch_name.strip_prefix("origin/") {
                stripped
            } else if let Some(pos) = branch_name.find('/') {
                &branch_name[pos + 1..]
            } else {
                branch_name
            };

            emit(&format!("Creating local branch {}...", local_name));
            let commit = remote_reference.peel_to_commit()?;
            repo.branch(local_name, &commit, false).map_err(|e| {
                AppError::Custom(format!("Failed to create local branch '{}': {}", local_name, e))
            })?;

            format!("refs/heads/{}", local_name)
        };

        let reference = repo.find_reference(&branch_ref).map_err(|_| {
            AppError::Custom(format!("Branch '{}' not found", branch_name))
        })?;

        emit("Checking out worktree...");
        repo.worktree(
            &request.name,
            &wt_path,
            Some(git2::WorktreeAddOptions::new().reference(Some(&reference))),
        )?;
    }

    if let Some(base) = &effective_base_branch {
        let _ = metadata::save_base_branch(&request.repo_path, &request.name, base);
    }

    emit("Finalizing...");
    let wt_repo = Repository::open(&wt_path)?;
    let branch = wt_repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from));
    let status = get_repo_status(&wt_repo)?;

    let wt_path_str = wt_path.to_string_lossy().to_string();
    let created_at = get_dir_created_at(&wt_path_str);

    Ok(WorktreeInfo {
        name: request.name.clone(),
        path: wt_path_str,
        branch,
        base_branch: effective_base_branch,
        stack_name: None,
        is_main: false,
        is_dirty: status.is_dirty,
        is_locked: false,
        is_rebasing: false,
        ahead: status.ahead,
        behind: status.behind,
        file_changes: status.file_changes,
        created_at,
    })
}

pub fn delete_worktree(repo_path: &str, worktree_name: &str) -> Result<(), AppError> {
    // Get the branch name before deleting (for stack cleanup)
    let branch = get_worktree_branch(repo_path, worktree_name);

    // Use git CLI which handles unlocking, pruning, and directory removal
    let output = silent_command("git")
        .args(["-C", repo_path, "worktree", "remove", "--force", worktree_name])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to run git worktree remove: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::Custom(
            if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                "git worktree remove failed.".to_string()
            },
        ));
    }

    // Clean up metadata (pass branch for stack cleanup)
    let _ = metadata::remove_worktree_meta(repo_path, worktree_name, branch.as_deref());

    Ok(())
}

/// Get the branch checked out in a worktree (by opening its repo).
fn get_worktree_branch(repo_path: &str, worktree_name: &str) -> Option<String> {
    let repo = Repository::open(repo_path).ok()?;
    let wt = repo.find_worktree(worktree_name).ok()?;
    let wt_path = wt.path().to_string_lossy().to_string();
    let wt_repo = Repository::open(&wt_path).ok()?;
    wt_repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from))
}

pub fn rebase_onto_master(_repo_path: &str, worktree_path: &str, base_branch: &str) -> Result<MergeResult, AppError> {
    // Fetch latest master from remote
    let fetch_output = silent_command("git")
        .args(["-C", worktree_path, "fetch", "origin", "master"])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to fetch master: {}", e)))?;

    if !fetch_output.status.success() {
        let stderr = String::from_utf8_lossy(&fetch_output.stderr).to_string();
        return Ok(MergeResult {
            success: false,
            has_conflicts: false,
            message: format!("Failed to fetch latest master: {}", stderr.trim()),
        });
    }

    rebase_onto(worktree_path, "origin/master", base_branch)
}

/// Generic rebase helper: rebases the current branch in worktree_path
/// onto `onto_ref`, using the merge-base between `old_base_ref` and HEAD.
pub fn rebase_onto(worktree_path: &str, onto_ref: &str, old_base_ref: &str) -> Result<MergeResult, AppError> {
    // Step 1: Find the merge-base SHA between old_base_ref and HEAD
    let merge_base_output = silent_command("git")
        .args(["-C", worktree_path, "merge-base", old_base_ref, "HEAD"])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to run git merge-base: {}", e)))?;

    if !merge_base_output.status.success() {
        let stderr = String::from_utf8_lossy(&merge_base_output.stderr).to_string();
        return Ok(MergeResult {
            success: false,
            has_conflicts: false,
            message: format!("Could not find merge-base between '{}' and HEAD: {}", old_base_ref, stderr.trim()),
        });
    }

    let merge_base_sha = String::from_utf8_lossy(&merge_base_output.stdout).trim().to_string();
    if merge_base_sha.is_empty() {
        return Ok(MergeResult {
            success: false,
            has_conflicts: false,
            message: format!("No common ancestor found between '{}' and HEAD.", old_base_ref),
        });
    }

    // Step 2: Get current branch name
    let branch_output = silent_command("git")
        .args(["-C", worktree_path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to get current branch: {}", e)))?;

    let current_branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    // Step 3: git rebase --onto <onto_ref> <merge_base_sha> <current_branch>
    let output = silent_command("git")
        .args(["-C", worktree_path, "rebase", "--onto", onto_ref, &merge_base_sha, &current_branch])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to run git rebase: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stderr, stdout);
    let has_conflicts = combined.contains("could not apply") || combined.contains("CONFLICT");

    if output.status.success() {
        Ok(MergeResult {
            success: true,
            has_conflicts: false,
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
            has_conflicts,
            message,
        })
    }
}

pub fn merge_base_branch(_repo_path: &str, worktree_path: &str, base_branch: &str) -> Result<MergeResult, AppError> {
    let output = silent_command("git")
        .args(["-C", worktree_path, "merge", base_branch])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to run git merge: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stderr, stdout);
    let has_conflicts = combined.contains("CONFLICT");

    if output.status.success() {
        Ok(MergeResult {
            success: true,
            has_conflicts: false,
            message: if stdout.trim().is_empty() {
                "Merge completed successfully.".to_string()
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
            "Merge failed with unknown error.".to_string()
        };

        Ok(MergeResult {
            success: false,
            has_conflicts,
            message,
        })
    }
}

fn run_git_rebase_action(worktree_path: &str, action: &str) -> Result<MergeResult, AppError> {
    let output = silent_command("git")
        .args(["-C", worktree_path, "rebase", action])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to run git rebase {}: {}", action, e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stderr, stdout);
    let has_conflicts = combined.contains("could not apply") || combined.contains("CONFLICT");

    if output.status.success() {
        Ok(MergeResult {
            success: true,
            has_conflicts: false,
            message: if action == "--abort" {
                "Rebase aborted.".to_string()
            } else if action == "--skip" {
                "Commit skipped.".to_string()
            } else {
                "Rebase continued.".to_string()
            },
        })
    } else {
        let message = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            format!("git rebase {} failed.", action)
        };

        Ok(MergeResult {
            success: false,
            has_conflicts,
            message,
        })
    }
}

pub fn rebase_continue(worktree_path: &str) -> Result<MergeResult, AppError> {
    run_git_rebase_action(worktree_path, "--continue")
}

pub fn rebase_skip(worktree_path: &str) -> Result<MergeResult, AppError> {
    run_git_rebase_action(worktree_path, "--skip")
}

pub fn rebase_abort(worktree_path: &str) -> Result<MergeResult, AppError> {
    run_git_rebase_action(worktree_path, "--abort")
}

/// Delete a batch of worktrees by name. Optionally checkout the main worktree to the default branch.
/// Returns a summary of what was done.
pub fn batch_delete_worktrees(repo_path: &str, worktree_names: &[String], checkout_main: bool) -> Result<String, AppError> {
    let mut deleted = Vec::new();
    let mut errors = Vec::new();

    for name in worktree_names {
        match delete_worktree(repo_path, name) {
            Ok(()) => deleted.push(name.clone()),
            Err(e) => errors.push(format!("{}: {}", name, e)),
        }
    }

    let mut messages = Vec::new();

    if !deleted.is_empty() {
        messages.push(format!("Deleted {} worktree(s): {}", deleted.len(), deleted.join(", ")));
    }

    if checkout_main {
        let main_branch = detect_main_branch(repo_path);
        let checkout_output = silent_command("git")
            .args(["-C", repo_path, "checkout", &main_branch])
            .output()
            .map_err(|e| AppError::Custom(format!("Failed to checkout {}: {}", main_branch, e)))?;

        if !checkout_output.status.success() {
            let stderr = String::from_utf8_lossy(&checkout_output.stderr).trim().to_string();
            messages.push(format!("Failed to checkout {}: {}", main_branch, stderr));
        } else {
            messages.push(format!("Main worktree checked out to {}", main_branch));
        }
    }

    if !errors.is_empty() {
        messages.push(format!("Errors: {}", errors.join("; ")));
    }

    if deleted.is_empty() && errors.is_empty() {
        Ok("No worktrees to delete.".to_string())
    } else {
        Ok(messages.join("\n"))
    }
}

/// Detect the default branch name (main or master).
fn detect_main_branch(repo_path: &str) -> String {
    // Check if origin/main exists
    let output = silent_command("git")
        .args(["-C", repo_path, "rev-parse", "--verify", "refs/remotes/origin/main"])
        .output();
    if let Ok(o) = output {
        if o.status.success() {
            return "main".to_string();
        }
    }
    // Check if origin/master exists
    let output = silent_command("git")
        .args(["-C", repo_path, "rev-parse", "--verify", "refs/remotes/origin/master"])
        .output();
    if let Ok(o) = output {
        if o.status.success() {
            return "master".to_string();
        }
    }
    // Fallback: check local branches
    let output = silent_command("git")
        .args(["-C", repo_path, "rev-parse", "--verify", "refs/heads/main"])
        .output();
    if let Ok(o) = output {
        if o.status.success() {
            return "main".to_string();
        }
    }
    "master".to_string()
}

pub fn repair_worktrees(repo_path: &str) -> Result<String, AppError> {
    let mut messages = Vec::new();

    // Step 1: Find worktrees whose directories no longer exist and prune them
    if let Ok(repo) = Repository::open(repo_path) {
        if let Ok(worktrees) = repo.worktrees() {
            let mut pruned = Vec::new();
            for name in worktrees.iter().flatten() {
                if let Ok(wt) = repo.find_worktree(name) {
                    let wt_path = wt.path().to_string_lossy().to_string();
                    if !std::path::Path::new(&wt_path).exists() {
                        // Get the branch before pruning so we can clean up metadata
                        let branch = get_worktree_branch(repo_path, name);
                        pruned.push((name.to_string(), branch));
                    }
                }
            }

            if !pruned.is_empty() {
                // `git worktree prune` removes entries for worktrees whose directories are gone
                let prune_output = silent_command("git")
                    .args(["-C", repo_path, "worktree", "prune"])
                    .output()
                    .map_err(|e| AppError::Custom(format!("Failed to run git worktree prune: {}", e)))?;

                if prune_output.status.success() {
                    for (name, branch) in &pruned {
                        let _ = metadata::remove_worktree_meta(repo_path, name, branch.as_deref());
                        messages.push(format!("Pruned missing worktree: {}", name));
                    }
                }
            }
        }
    }

    // Step 2: Repair from main repo (fixes main -> worktree links)
    let output = silent_command("git")
        .args(["-C", repo_path, "worktree", "repair"])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to run git worktree repair: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::Custom(
            if !stderr.trim().is_empty() { stderr.trim().to_string() }
            else { "git worktree repair failed.".to_string() }
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if !stdout.trim().is_empty() {
        messages.push(stdout.trim().to_string());
    }

    // Step 3: Repair from each remaining worktree directory (fixes worktree -> main links)
    if let Ok(repo) = Repository::open(repo_path) {
        if let Ok(worktrees) = repo.worktrees() {
            for name in worktrees.iter().flatten() {
                if let Ok(wt) = repo.find_worktree(name) {
                    let wt_path = wt.path().to_string_lossy().to_string();
                    if std::path::Path::new(&wt_path).exists() {
                        let wt_output = silent_command("git")
                            .args(["-C", &wt_path, "worktree", "repair"])
                            .output();
                        if let Ok(o) = wt_output {
                            let s = String::from_utf8_lossy(&o.stdout).to_string();
                            if !s.trim().is_empty() {
                                messages.push(s.trim().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(if messages.is_empty() {
        "All worktrees repaired successfully.".to_string()
    } else {
        messages.join("\n")
    })
}
