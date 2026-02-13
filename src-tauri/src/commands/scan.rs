use crate::error::AppError;
use crate::git::scanner;
use crate::models::RepoInfo;

#[tauri::command]
pub fn scan_repos(root_path: String) -> Result<Vec<RepoInfo>, AppError> {
    Ok(scanner::scan_repos(&root_path))
}
