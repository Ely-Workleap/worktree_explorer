mod commands;
mod error;
mod git;
mod models;

use commands::{open, repo_info, scan, worktree};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri::Manager;
            // Ensure the window is visible and focused on launch
            if let Some(win) = app.webview_windows().values().next() {
                let _ = win.show();
                let _ = win.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan::scan_repos,
            worktree::list_worktrees,
            worktree::create_worktree,
            worktree::delete_worktree,
            worktree::merge_base_branch,
            worktree::rebase_onto_master,
            worktree::set_base_branch,
            repo_info::list_branches,
            open::open_in_vscode,
            open::open_in_visual_studio,
            open::open_in_explorer,
            open::open_in_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
