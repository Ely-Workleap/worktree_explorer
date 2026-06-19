use git2::Repository;
use rayon::prelude::*;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use walkdir::WalkDir;

use crate::models::RepoInfo;

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    ".git",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "vendor",
];

const CACHE_TTL: Duration = Duration::from_secs(5);

pub struct ScanCache {
    result: Option<Vec<RepoInfo>>,
    cached_at: Option<Instant>,
    root_path: Option<String>,
}

impl ScanCache {
    pub fn new() -> Self {
        Self {
            result: None,
            cached_at: None,
            root_path: None,
        }
    }

    pub fn get(&self, root_path: &str) -> Option<&Vec<RepoInfo>> {
        match (&self.result, &self.cached_at, &self.root_path) {
            (Some(result), Some(at), Some(path))
                if path == root_path && at.elapsed() < CACHE_TTL =>
            {
                Some(result)
            }
            _ => None,
        }
    }

    pub fn set(&mut self, root_path: String, result: Vec<RepoInfo>) {
        self.root_path = Some(root_path);
        self.result = Some(result);
        self.cached_at = Some(Instant::now());
    }

    pub fn invalidate(&mut self) {
        self.cached_at = None;
    }
}

pub fn scan_repos(root_path: &str) -> Vec<RepoInfo> {
    // Collect candidate directories with pruning (sequential traversal is fine here —
    // the walk itself is cheap; the expensive part is opening each repo below).
    let candidates: Vec<PathBuf> = WalkDir::new(root_path)
        .follow_links(false)
        .max_depth(5)
        .into_iter()
        .filter_entry(|entry| {
            if !entry.file_type().is_dir() {
                return true;
            }
            let name = entry.file_name().to_string_lossy();
            !SKIP_DIRS.iter().any(|skip| name == *skip)
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir())
        .map(|e| e.into_path())
        .collect();

    // Open repos in parallel — each thread gets its own Repository handle.
    // Pre-filter with a cheap .git existence check to avoid triggering credential
    // helpers (Windows Credential Manager / SSH agent) on non-git directories.
    let mut repos: Vec<RepoInfo> = candidates
        .par_iter()
        .filter(|path| path.join(".git").exists())
        .filter_map(|path| {
            let repo = Repository::open(path).ok()?;
            let worktree_count = repo.worktrees().map(|wts| wts.len() + 1).unwrap_or(1);
            if worktree_count <= 1 {
                return None;
            }
            let name = path.file_name()?.to_string_lossy().to_string();
            Some(RepoInfo {
                name,
                path: path.to_string_lossy().to_string(),
                worktree_count,
            })
        })
        .collect();

    repos.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    repos
}
