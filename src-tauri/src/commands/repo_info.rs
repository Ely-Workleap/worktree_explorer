use crate::util::silent_command;

use git2::{BranchType, Repository};

use crate::error::AppError;
use crate::git::metadata;
use crate::models::{BranchInfo, BuildConfig};

#[tauri::command]
pub async fn list_branches(repo_path: String) -> Result<Vec<BranchInfo>, AppError> {
    tokio::task::spawn_blocking(move || {
        // Fetch all remotes to get the latest branches
        let _ = silent_command("git")
            .args(["-C", &repo_path, "fetch", "--all", "--prune"])
            .output();

        let repo = Repository::open(&repo_path)?;
        let mut branches = Vec::new();

        for branch_result in repo.branches(None)? {
            let (branch, branch_type) = branch_result?;
            let name = match branch.name()? {
                Some(n) => n.to_string(),
                None => continue,
            };
            let is_head = branch.is_head();
            let is_remote = branch_type == BranchType::Remote;

            branches.push(BranchInfo {
                name,
                is_remote,
                is_head,
            });
        }

        // Sort: local first, then by name
        branches.sort_by(|a, b| {
            a.is_remote
                .cmp(&b.is_remote)
                .then_with(|| a.name.cmp(&b.name))
        });

        Ok(branches)
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub async fn get_build_config(repo_path: String) -> Result<Option<BuildConfig>, AppError> {
    tokio::task::spawn_blocking(move || Ok(metadata::get_build_config(&repo_path)))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn set_build_config(
    repo_path: String,
    config: Option<BuildConfig>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || metadata::set_build_config(&repo_path, config))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}
