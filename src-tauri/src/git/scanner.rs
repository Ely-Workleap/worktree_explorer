use git2::Repository;
use std::path::Path;
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

pub fn scan_repos(root_path: &str) -> Vec<RepoInfo> {
    let mut repos = Vec::new();

    let walker = WalkDir::new(root_path)
        .follow_links(false)
        .max_depth(5)
        .into_iter()
        .filter_entry(|entry| {
            if !entry.file_type().is_dir() {
                return true;
            }
            let name = entry.file_name().to_string_lossy();
            !SKIP_DIRS.iter().any(|skip| name == *skip)
        });

    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_dir() {
            continue;
        }

        let path = entry.path();
        if !is_git_repo(path) {
            continue;
        }

        if let Ok(repo) = Repository::open(path) {
            let worktree_count = match repo.worktrees() {
                Ok(wts) => wts.len() + 1, // +1 for main worktree
                Err(_) => 1,
            };

            if worktree_count > 1 {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "unknown".to_string());

                repos.push(RepoInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    worktree_count,
                });
            }
        }
    }

    repos.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    repos
}

fn is_git_repo(path: &Path) -> bool {
    path.join(".git").exists()
}
