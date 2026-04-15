use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::models::{BuildConfig, StackInfo};

const META_FILE: &str = ".worktree-meta.json";

static METADATA_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Initialize the metadata storage directory. Must be called once at app startup.
pub fn init_metadata_dir(app_data_dir: PathBuf) {
    let dir = app_data_dir.join("metadata");
    std::fs::create_dir_all(&dir).expect("Failed to create metadata directory");
    METADATA_DIR
        .set(dir)
        .expect("METADATA_DIR already initialized");
}

fn metadata_dir() -> &'static PathBuf {
    METADATA_DIR
        .get()
        .expect("METADATA_DIR not initialized — call init_metadata_dir at startup")
}

/// Derive the per-repo metadata file path from the repo path.
fn repo_meta_path(repo_path: &str) -> PathBuf {
    let canonical = std::fs::canonicalize(repo_path)
        .unwrap_or_else(|_| PathBuf::from(repo_path));
    let canonical_str = canonical.to_string_lossy().to_lowercase();

    let mut hasher = DefaultHasher::new();
    canonical_str.hash(&mut hasher);
    let hash = hasher.finish();
    let filename = format!("{:012x}.json", hash);

    metadata_dir().join(filename)
}

/// Update the debug index file mapping hashes to repo paths (best-effort).
fn update_index(repo_path: &str) {
    let index_path = metadata_dir().join("_index.json");
    let mut index: HashMap<String, String> = std::fs::read_to_string(&index_path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default();

    let canonical = std::fs::canonicalize(repo_path)
        .unwrap_or_else(|_| PathBuf::from(repo_path));
    let canonical_str = canonical.to_string_lossy().to_lowercase();

    let mut hasher = DefaultHasher::new();
    canonical_str.hash(&mut hasher);
    let hash = hasher.finish();
    let key = format!("{:012x}", hash);

    index.insert(key, repo_path.to_string());

    if let Ok(content) = serde_json::to_string_pretty(&index) {
        let _ = std::fs::write(&index_path, content);
    }
}

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub build_config: Option<BuildConfig>,
}

impl Default for MetadataV2 {
    fn default() -> Self {
        Self {
            version: 2,
            worktrees: HashMap::new(),
            stacks: HashMap::new(),
            build_config: None,
        }
    }
}

/// Parse legacy content (V1 flat map or V2 JSON) into MetadataV2.
fn parse_legacy_content(content: &str) -> MetadataV2 {
    // Try V2 first
    if let Ok(v2) = serde_json::from_str::<MetadataV2>(content) {
        if v2.version >= 2 {
            return v2;
        }
    }
    // Try V1 (flat map of worktree_name -> base_branch)
    if let Ok(v1) = serde_json::from_str::<HashMap<String, String>>(content) {
        let worktrees = v1
            .into_iter()
            .map(|(name, base_branch)| (name, WorktreeEntry { base_branch }))
            .collect();
        return MetadataV2 {
            version: 2,
            worktrees,
            stacks: HashMap::new(),
            build_config: None,
        };
    }
    MetadataV2::default()
}

/// Read metadata from app data dir, with auto-migration from old repo-root location.
pub fn read_metadata_v2(repo_path: &str) -> MetadataV2 {
    let app_path = repo_meta_path(repo_path);

    // Try reading from app data dir first
    if let Ok(content) = std::fs::read_to_string(&app_path) {
        if let Ok(v2) = serde_json::from_str::<MetadataV2>(&content) {
            if v2.version >= 2 {
                return v2;
            }
        }
    }

    // Fallback: try old repo-root location and migrate
    let old_path = Path::new(repo_path).join(META_FILE);
    if let Ok(content) = std::fs::read_to_string(&old_path) {
        let migrated = parse_legacy_content(&content);
        // Write to new location
        if write_metadata_v2(repo_path, &migrated).is_ok() {
            // Delete old file (best-effort)
            let _ = std::fs::remove_file(&old_path);
        }
        return migrated;
    }

    MetadataV2::default()
}

/// Write V2 metadata to the app data directory.
pub fn write_metadata_v2(repo_path: &str, meta: &MetadataV2) -> Result<(), AppError> {
    let path = repo_meta_path(repo_path);
    let content = serde_json::to_string_pretty(meta)
        .map_err(|e| AppError::Custom(format!("Failed to serialize metadata: {}", e)))?;
    std::fs::write(&path, content)?;

    // Update the debug index (best-effort)
    update_index(repo_path);

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

/// Get the build config for a repo, if set.
pub fn get_build_config(repo_path: &str) -> Option<BuildConfig> {
    read_metadata_v2(repo_path).build_config
}

/// Save (or clear) the build config for a repo.
pub fn set_build_config(
    repo_path: &str,
    config: Option<BuildConfig>,
) -> Result<(), AppError> {
    let mut meta = read_metadata_v2(repo_path);
    meta.build_config = config;
    write_metadata_v2(repo_path, &meta)
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
