mod commands;
mod error;
mod git;
mod models;
mod util;

use commands::{github, open, repo_info, scan, stack, worktree};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri::Manager;

            // Initialize metadata storage in app data directory
            let app_data_dir = app.path().app_local_data_dir()
                .expect("Failed to get app local data directory");
            crate::git::metadata::init_metadata_dir(app_data_dir);

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
            worktree::rebase_continue,
            worktree::rebase_skip,
            worktree::rebase_abort,
            worktree::batch_delete_worktrees,
            worktree::repair_worktrees,
            repo_info::list_branches,
            repo_info::file_exists,
            repo_info::get_build_config,
            repo_info::set_build_config,
            stack::list_stacks,
            stack::get_stack_details,
            stack::create_stack,
            stack::add_branch_to_stack,
            stack::remove_branch_from_stack,
            stack::delete_stack,
            stack::rename_stack,
            stack::cascade_rebase,
            stack::split_into_stack,
            github::check_gh_available,
            github::get_stack_pr_statuses,
            github::create_stack_prs,
            github::update_stack_pr_bases,
            github::push_stack,
            github::checkout_pr_worktree,
            github::pull_pr_worktree,
            github::list_pr_worktrees,
            open::open_in_vscode,
            open::open_in_visual_studio,
            open::open_in_explorer,
            open::open_terminal_tool,
            open::open_claude_split,
            open::open_claude_cascade_resolve,
            open::open_claude_pr_review,
            open::build_pr,
            open::run_pr,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
