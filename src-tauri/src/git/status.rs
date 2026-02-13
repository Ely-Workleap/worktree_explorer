use git2::{Repository, StatusOptions};

use crate::error::AppError;

pub struct RepoStatus {
    pub is_dirty: bool,
    pub file_changes: usize,
    pub ahead: usize,
    pub behind: usize,
}

pub fn get_repo_status(repo: &Repository) -> Result<RepoStatus, AppError> {
    // Check dirty status
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false)
        .exclude_submodules(true);

    let statuses = repo.statuses(Some(&mut opts))?;
    let file_changes = statuses.len();
    let is_dirty = file_changes > 0;

    // Check ahead/behind
    let (ahead, behind) = get_ahead_behind(repo).unwrap_or((0, 0));

    Ok(RepoStatus {
        is_dirty,
        file_changes,
        ahead,
        behind,
    })
}

fn get_ahead_behind(repo: &Repository) -> Result<(usize, usize), AppError> {
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok((0, 0)),
    };

    let branch_name = match head.shorthand() {
        Some(name) => name.to_string(),
        None => return Ok((0, 0)),
    };

    let local_oid = head.target().ok_or_else(|| {
        AppError::Custom("Could not get HEAD target".to_string())
    })?;

    let upstream_name = format!("refs/remotes/origin/{}", branch_name);
    let upstream_ref = match repo.find_reference(&upstream_name) {
        Ok(r) => r,
        Err(_) => return Ok((0, 0)),
    };

    let upstream_oid = upstream_ref.target().ok_or_else(|| {
        AppError::Custom("Could not get upstream target".to_string())
    })?;

    let (ahead, behind) = repo.graph_ahead_behind(local_oid, upstream_oid)?;
    Ok((ahead, behind))
}
