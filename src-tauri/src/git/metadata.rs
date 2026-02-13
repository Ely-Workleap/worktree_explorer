use std::collections::HashMap;
use std::path::Path;

use crate::error::AppError;

const META_FILE: &str = ".worktree-meta.json";

/// Read the worktree metadata file from the repo root.
/// Returns a map of worktree_name -> base_branch.
pub fn read_metadata(repo_path: &str) -> HashMap<String, String> {
    let path = Path::new(repo_path).join(META_FILE);
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

/// Write the worktree metadata file to the repo root.
fn write_metadata(repo_path: &str, meta: &HashMap<String, String>) -> Result<(), AppError> {
    let path = Path::new(repo_path).join(META_FILE);
    let content = serde_json::to_string_pretty(meta)
        .map_err(|e| AppError::Custom(format!("Failed to serialize metadata: {}", e)))?;
    std::fs::write(&path, content)?;
    Ok(())
}

/// Save the base branch for a worktree.
pub fn save_base_branch(repo_path: &str, worktree_name: &str, base_branch: &str) -> Result<(), AppError> {
    let mut meta = read_metadata(repo_path);
    meta.insert(worktree_name.to_string(), base_branch.to_string());
    write_metadata(repo_path, &meta)
}

/// Remove metadata for a worktree.
pub fn remove_worktree_meta(repo_path: &str, worktree_name: &str) -> Result<(), AppError> {
    let mut meta = read_metadata(repo_path);
    if meta.remove(worktree_name).is_some() {
        write_metadata(repo_path, &meta)?;
    }
    Ok(())
}
