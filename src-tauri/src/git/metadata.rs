use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::models::StackInfo;

const META_FILE: &str = ".worktree-meta.json";

/// Worktree entry in V2 metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeEntry {
    pub base_branch: String,
}

/// V2 metadata format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataV2 {
    pub version: u32,
    #[serde(default)]
    pub worktrees: HashMap<String, WorktreeEntry>,
    #[serde(default)]
    pub stacks: HashMap<String, StackInfo>,
}

impl Default for MetadataV2 {
    fn default() -> Self {
        Self {
            version: 2,
            worktrees: HashMap::new(),
            stacks: HashMap::new(),
        }
    }
}

/// Read metadata, auto-migrating from V1 if needed.
pub fn read_metadata_v2(repo_path: &str) -> MetadataV2 {
    let path = Path::new(repo_path).join(META_FILE);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return MetadataV2::default(),
    };

    // Try parsing as V2 first
    if let Ok(v2) = serde_json::from_str::<MetadataV2>(&content) {
        if v2.version >= 2 {
            return v2;
        }
    }

    // Try parsing as V1 (flat map of worktree_name -> base_branch)
    if let Ok(v1) = serde_json::from_str::<HashMap<String, String>>(&content) {
        let worktrees = v1
            .into_iter()
            .map(|(name, base_branch)| (name, WorktreeEntry { base_branch }))
            .collect();
        return MetadataV2 {
            version: 2,
            worktrees,
            stacks: HashMap::new(),
        };
    }

    MetadataV2::default()
}

/// Write V2 metadata to disk.
pub fn write_metadata_v2(repo_path: &str, meta: &MetadataV2) -> Result<(), AppError> {
    let path = Path::new(repo_path).join(META_FILE);
    let content = serde_json::to_string_pretty(meta)
        .map_err(|e| AppError::Custom(format!("Failed to serialize metadata: {}", e)))?;
    std::fs::write(&path, content)?;
    Ok(())
}

// --- Compatibility helpers for existing callers ---

/// Get the base branch for a worktree name from V2 metadata.
pub fn get_base_branch(meta: &MetadataV2, worktree_name: &str) -> Option<String> {
    meta.worktrees
        .get(worktree_name)
        .map(|e| e.base_branch.clone())
}

/// Find which stack (if any) a branch belongs to.
pub fn find_stack_for_branch(meta: &MetadataV2, branch: &str) -> Option<String> {
    for (stack_name, stack) in &meta.stacks {
        if stack.branches.contains(&branch.to_string()) {
            return Some(stack_name.clone());
        }
    }
    None
}

// --- Save/remove with V2 format (backward-compatible API) ---

/// Save the base branch for a worktree (V2-compatible).
pub fn save_base_branch(
    repo_path: &str,
    worktree_name: &str,
    base_branch: &str,
) -> Result<(), AppError> {
    let mut meta = read_metadata_v2(repo_path);
    meta.worktrees.insert(
        worktree_name.to_string(),
        WorktreeEntry {
            base_branch: base_branch.to_string(),
        },
    );
    write_metadata_v2(repo_path, &meta)
}

/// Remove metadata for a worktree (V2-compatible).
/// Also removes the worktree's branch from any stack it belongs to.
pub fn remove_worktree_meta(
    repo_path: &str,
    worktree_name: &str,
    branch: Option<&str>,
) -> Result<(), AppError> {
    let mut meta = read_metadata_v2(repo_path);
    let mut changed = false;

    if meta.worktrees.remove(worktree_name).is_some() {
        changed = true;
    }

    // If we know the branch, remove it from any stack
    if let Some(branch) = branch {
        for stack in meta.stacks.values_mut() {
            if let Some(pos) = stack.branches.iter().position(|b| b == branch) {
                stack.branches.remove(pos);
                stack.pr_numbers.remove(branch);
                changed = true;
            }
        }
        // Clean up empty stacks
        meta.stacks.retain(|_, s| !s.branches.is_empty());
    }

    if changed {
        write_metadata_v2(repo_path, &meta)?;
    }
    Ok(())
}

// --- Stack CRUD ---

/// Create a new stack in metadata.
pub fn create_stack(repo_path: &str, stack: StackInfo) -> Result<(), AppError> {
    let mut meta = read_metadata_v2(repo_path);
    if meta.stacks.contains_key(&stack.name) {
        return Err(AppError::Custom(format!(
            "Stack '{}' already exists",
            stack.name
        )));
    }
    meta.stacks.insert(stack.name.clone(), stack);
    write_metadata_v2(repo_path, &meta)
}

/// Add a branch to a stack at the given position (or append).
pub fn add_to_stack(
    repo_path: &str,
    stack_name: &str,
    branch: &str,
    position: Option<usize>,
) -> Result<StackInfo, AppError> {
    let mut meta = read_metadata_v2(repo_path);
    let stack = meta
        .stacks
        .get_mut(stack_name)
        .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", stack_name)))?;

    if stack.branches.contains(&branch.to_string()) {
        return Err(AppError::Custom(format!(
            "Branch '{}' is already in stack '{}'",
            branch, stack_name
        )));
    }

    match position {
        Some(pos) if pos < stack.branches.len() => {
            stack.branches.insert(pos, branch.to_string());
        }
        _ => {
            stack.branches.push(branch.to_string());
        }
    }

    let result = stack.clone();
    write_metadata_v2(repo_path, &meta)?;
    Ok(result)
}

/// Remove a branch from a stack. If removing a middle branch, the chain relinks automatically.
pub fn remove_from_stack(
    repo_path: &str,
    stack_name: &str,
    branch: &str,
) -> Result<StackInfo, AppError> {
    let mut meta = read_metadata_v2(repo_path);
    let stack = meta
        .stacks
        .get_mut(stack_name)
        .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", stack_name)))?;

    let pos = stack
        .branches
        .iter()
        .position(|b| b == branch)
        .ok_or_else(|| {
            AppError::Custom(format!(
                "Branch '{}' not found in stack '{}'",
                branch, stack_name
            ))
        })?;

    stack.branches.remove(pos);
    stack.pr_numbers.remove(branch);

    // Relink: if we removed B between A and C, update C's base branch to A (or root)
    // The actual base_branch update in the worktree entry is handled by the caller (stack_ops)

    let result = stack.clone();

    // Remove stack if empty
    if stack.branches.is_empty() {
        meta.stacks.remove(stack_name);
    }

    write_metadata_v2(repo_path, &meta)?;
    Ok(result)
}

/// Delete an entire stack from metadata.
pub fn delete_stack(repo_path: &str, stack_name: &str) -> Result<(), AppError> {
    let mut meta = read_metadata_v2(repo_path);
    if meta.stacks.remove(stack_name).is_none() {
        return Err(AppError::Custom(format!(
            "Stack '{}' not found",
            stack_name
        )));
    }
    write_metadata_v2(repo_path, &meta)
}

/// Rename a stack.
pub fn rename_stack(
    repo_path: &str,
    old_name: &str,
    new_name: &str,
) -> Result<StackInfo, AppError> {
    let mut meta = read_metadata_v2(repo_path);
    if meta.stacks.contains_key(new_name) {
        return Err(AppError::Custom(format!(
            "Stack '{}' already exists",
            new_name
        )));
    }
    let mut stack = meta
        .stacks
        .remove(old_name)
        .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", old_name)))?;
    stack.name = new_name.to_string();
    let result = stack.clone();
    meta.stacks.insert(new_name.to_string(), stack);
    write_metadata_v2(repo_path, &meta)?;
    Ok(result)
}

/// List all stacks for a repo.
pub fn list_stacks(repo_path: &str) -> Vec<StackInfo> {
    let meta = read_metadata_v2(repo_path);
    meta.stacks.values().cloned().collect()
}

/// Set a PR number for a branch in a stack.
pub fn set_pr_number(
    repo_path: &str,
    stack_name: &str,
    branch: &str,
    pr_number: Option<u64>,
) -> Result<(), AppError> {
    let mut meta = read_metadata_v2(repo_path);
    let stack = meta
        .stacks
        .get_mut(stack_name)
        .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", stack_name)))?;
    stack.pr_numbers.insert(branch.to_string(), pr_number);
    write_metadata_v2(repo_path, &meta)
}
