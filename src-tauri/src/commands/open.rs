use crate::error::AppError;
use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::{Mutex, OnceLock};

const CREATE_NEW_CONSOLE: u32 = 0x00000010;
const SW_RESTORE: i32 = 9;

// Win32 FFI for console window management
extern "system" {
    fn FreeConsole() -> i32;
    fn AttachConsole(process_id: u32) -> i32;
    fn GetConsoleWindow() -> isize;
    fn SetForegroundWindow(hwnd: isize) -> i32;
    fn ShowWindow(hwnd: isize, cmd_show: i32) -> i32;
}

/// PID map keyed by "tool:worktree_name" (e.g. "claude:my-feature")
fn tool_pids() -> &'static Mutex<HashMap<String, u32>> {
    static PIDS: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();
    PIDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn console_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn focus_console_window(pid: u32) -> bool {
    let _guard = console_lock().lock().unwrap();

    unsafe {
        FreeConsole();

        if AttachConsole(pid) == 0 {
            return false;
        }

        let hwnd = GetConsoleWindow();
        if hwnd == 0 {
            FreeConsole();
            return false;
        }

        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
        FreeConsole();
        true
    }
}

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

/// Generic command to open a CLI tool in a new console window with reopen support.
/// `tool` must be one of: "claude", "codex", "lazygit"
#[tauri::command]
pub async fn open_terminal_tool(
    path: String,
    worktree_name: String,
    tool: String,
) -> Result<(), AppError> {
    let tool_cmd = match tool.as_str() {
        "claude" => "claude",
        "codex" => "codex",
        "lazygit" => "lazygit",
        _ => return Err(AppError::Custom(format!("Unknown tool: {}", tool))),
    };

    tokio::task::spawn_blocking(move || {
        let pid_key = format!("{}:{}", tool, worktree_name);

        // Check for an existing PID
        let existing_pid = {
            let pids = tool_pids().lock().unwrap();
            pids.get(&pid_key).copied()
        };

        if let Some(pid) = existing_pid {
            if focus_console_window(pid) {
                return Ok(());
            }
            tool_pids().lock().unwrap().remove(&pid_key);
        }

        // Spawn a new PowerShell window with the tool
        let inner_cmd = format!(
            "Set-Location '{}'; {}",
            path.replace('\'', "''"),
            tool_cmd,
        );

        let child = Command::new("powershell")
            .args(["-NoExit", "-Command", &inner_cmd])
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map_err(|e| AppError::Custom(format!("Failed to open {}: {}", tool, e)))?;

        tool_pids().lock().unwrap().insert(pid_key, child.id());

        Ok(())
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

/// Build the split prompt with full instructions for Claude Code.
fn build_split_prompt(branch_name: &str, repo_path: &str) -> String {
    format!(
r#"Split the branch '{branch}' in '{repo}' into a stacked PR chain. Follow these steps exactly:

1. REVIEW: Look at all uncommitted changes (git status, git diff) and existing commits (git log --oneline {branch} --not origin/master). Group everything into logical concerns ordered by dependency (infra/config, models/types, shared utils, core logic, UI). IMPORTANT: Do NOT create a separate "tests" group — instead, include each test file in the same group as the source code it tests (e.g. utils.test.ts goes with utils.ts, ComponentName.spec.tsx goes with ComponentName.tsx).

2. COMMIT: Stage and commit any uncommitted files into well-structured commits grouped by concern. Use conventional commit messages.

3. JIRA: Extract the parent Jira ticket ID from the source branch name (e.g. SGD-12345 from feature/SGD-12345-my-feature). Using the Atlassian MCP tool, create a Jira subtask under the parent ticket for EACH group identified in step 1. Use the subtask summary as a short description (e.g. "Part 1: Add data models"). Collect the new subtask issue keys (e.g. SGD-12346, SGD-12347, ...) — these will be used in branch names.

4. SPLIT: Create a new branch+worktree for EVERY group (including group 0) as sibling directories to the repo:
   - Every branch in the stack MUST have its own worktree so it can be opened and built independently
   - For group 0: branch from master, cherry-pick or checkout relevant commits/files
   - For group N: branch from group N-1's branch
   - Worktree names: wt-<subtask-key>  (e.g. wt-SGD-12346)
   - Branch names: feature/<subtask-key>-<short-description>  (e.g. feature/SGD-12346-add-data-models)
   - The feature/ prefix and subtask issue key are MANDATORY for Jira tracking
   - Each branch MUST include the test files that cover its source code (colocate tests with implementation, never bundle all tests into a single PR)

5. METADATA: Update (or create) .worktree-meta.json at the repo root '{repo}' with V2 format:
```json
{{
  "version": 2,
  "worktrees": {{
    "wt-SGD-12346": {{ "base_branch": "master" }},
    "wt-SGD-12347": {{ "base_branch": "feature/SGD-12346-add-data-models" }}
  }},
  "stacks": {{
    "<parent-ticket>-stack": {{
      "name": "<parent-ticket>-stack",
      "root_branch": "master",
      "branches": ["feature/SGD-12346-add-data-models", "feature/SGD-12347-add-api"],
      "pr_numbers": {{}}
    }}
  }}
}}
```
   If the file already exists, merge your entries into the existing worktrees and stacks objects. The branches array is ordered bottom-to-top (index 0 = closest to root). Each branch base = previous branch in array, or root_branch for index 0.

6. PUSH + PR: Push all branches with --force-with-lease, then create draft PRs with correct base chain (gh pr create --draft --base <prev-branch> --head <branch>). Title each PR as '<subtask-key> Part N: <description>'. Look for a PR template in .github/pull_request_template.md and follow its format.

7. VERIFY: Check each branch has the expected changes and no overlap with other groups.

8. TEST REPORT: For each PR in the stack, assess whether tests are needed:
   - Check if the PR touches logic that has existing tests or should have tests (business logic, utils, API endpoints, hooks)
   - Check if there are existing test files nearby (*.test.ts, *.spec.ts, __tests__/) that should be updated
   - PRs that are pure config, type-only, or styling changes may not need tests
   At the end, print a summary report like:
   ```
   === Test Coverage Report ===
   Part 1 (models/types): No tests needed - type definitions only
   Part 2 (API endpoints): TESTS NEEDED - new endpoint logic, no tests found
   Part 3 (UI components): TESTS NEEDED - component has user interactions
   Part 4 (config): No tests needed - build config only
   ```
   Flag any PR that needs tests but has none so they can be addressed before merging."#,
        branch = branch_name,
        repo = repo_path,
    )
}

/// Open Claude Code with a pre-filled prompt to split a worktree into a stacked PR chain.
#[tauri::command]
pub async fn open_claude_split(
    worktree_path: String,
    worktree_name: String,
    repo_path: String,
    branch_name: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let pid_key = format!("claude-split:{}", worktree_name);

        // Check for an existing PID
        let existing_pid = {
            let pids = tool_pids().lock().unwrap();
            pids.get(&pid_key).copied()
        };

        if let Some(pid) = existing_pid {
            if focus_console_window(pid) {
                return Ok(());
            }
            tool_pids().lock().unwrap().remove(&pid_key);
        }

        let prompt = build_split_prompt(&branch_name, &repo_path.replace('\\', "/"));

        // Write prompt to a temp file to avoid shell escaping issues
        let temp_dir = std::env::temp_dir();
        let prompt_file = temp_dir.join(format!("claude-split-{}.txt", worktree_name));
        std::fs::write(&prompt_file, &prompt)
            .map_err(|e| AppError::Custom(format!("Failed to write prompt file: {}", e)))?;

        let inner_cmd = format!(
            "Set-Location '{}'; $p = Get-Content '{}' -Raw; claude --dangerously-skip-permissions $p",
            worktree_path.replace('\'', "''"),
            prompt_file.to_string_lossy().replace('\'', "''"),
        );

        let child = Command::new("powershell")
            .args(["-NoExit", "-Command", &inner_cmd])
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map_err(|e| AppError::Custom(format!("Failed to open Claude split: {}", e)))?;

        tool_pids().lock().unwrap().insert(pid_key, child.id());

        Ok(())
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}
