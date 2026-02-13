use git2::{BranchType, Repository};

use crate::error::AppError;
use crate::models::BranchInfo;

#[tauri::command]
pub fn list_branches(repo_path: String) -> Result<Vec<BranchInfo>, AppError> {
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
}
