use crate::error::AppError;
use std::process::Command;

#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), AppError> {
    Command::new("cmd")
        .args(["/C", "code", &path])
        .spawn()
        .map_err(|e| AppError::Custom(format!("Failed to open VS Code: {}", e)))?;
    Ok(())
}

#[tauri::command]
pub fn open_in_visual_studio(path: String) -> Result<(), AppError> {
    Command::new("cmd")
        .args(["/C", "start", "devenv", &path])
        .spawn()
        .map_err(|e| AppError::Custom(format!("Failed to open Visual Studio: {}", e)))?;
    Ok(())
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), AppError> {
    Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| AppError::Custom(format!("Failed to open Explorer: {}", e)))?;
    Ok(())
}

#[tauri::command]
pub fn open_in_terminal(path: String) -> Result<(), AppError> {
    Command::new("cmd")
        .args([
            "/C",
            "start",
            "powershell",
            "-NoExit",
            "-Command",
            &format!("Set-Location '{}'", path),
        ])
        .spawn()
        .map_err(|e| AppError::Custom(format!("Failed to open Terminal: {}", e)))?;
    Ok(())
}
