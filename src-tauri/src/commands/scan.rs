use crate::error::AppError;
use crate::git::scanner;
use crate::models::RepoInfo;

#[tauri::command]
pub async fn scan_repos(root_path: String) -> Result<Vec<RepoInfo>, AppError> {
    tokio::task::spawn_blocking(move || Ok(scanner::scan_repos(&root_path)))
        .await
        .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}
