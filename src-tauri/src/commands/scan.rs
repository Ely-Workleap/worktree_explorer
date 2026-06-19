use std::sync::Mutex;

use crate::error::AppError;
use crate::git::scanner::{self, ScanCache};
use crate::models::RepoInfo;

#[tauri::command]
pub async fn scan_repos(
    root_path: String,
    cache: tauri::State<'_, Mutex<ScanCache>>,
) -> Result<Vec<RepoInfo>, AppError> {
    {
        let guard = cache.lock().unwrap();
        if let Some(cached) = guard.get(&root_path) {
            return Ok(cached.clone());
        }
    }

    let root = root_path.clone();
    let result: Vec<RepoInfo> = tokio::task::spawn_blocking(move || {
        Ok::<Vec<RepoInfo>, AppError>(scanner::scan_repos(&root))
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))??;

    {
        let mut guard = cache.lock().unwrap();
        guard.set(root_path, result.clone());
    }

    Ok(result)
}
