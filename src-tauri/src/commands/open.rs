use crate::error::AppError;
use crate::git::metadata;
use crate::git::stack_ops;
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

/// Open a PowerShell console that builds the solution.
/// `sln_path` is relative to `worktree_path`.
#[tauri::command]
pub async fn build_pr(
    worktree_path: String,
    worktree_name: String,
    sln_path: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let pid_key = format!("build:{}", worktree_name);

        // Kill any previous build console so we always get a fresh build
        {
            let mut pids = tool_pids().lock().unwrap();
            if let Some(old_pid) = pids.remove(&pid_key) {
                let _ = Command::new("taskkill")
                    .args(["/PID", &old_pid.to_string(), "/F", "/T"])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .output();
            }
        }

        let wt = worktree_path.replace('\'', "''");
        let sln = sln_path.replace('\'', "''");

        let inner_cmd = format!(
            "Set-Location '{wt}'; \
             Write-Host '=== Building {sln} ===' -ForegroundColor Cyan; \
             dotnet build '{sln}' --configuration Debug /p:DebugNoAnalyzers=true; \
             if ($LASTEXITCODE -eq 0) {{ \
                 Write-Host '=== Build succeeded ===' -ForegroundColor Green; \
                 [console]::beep(880,150); Start-Sleep -Milliseconds 80; [console]::beep(1100,350) \
             }} else {{ \
                 Write-Host '=== Build FAILED ===' -ForegroundColor Red; \
                 [console]::beep(300,600) \
             }}"
        );

        let child = Command::new("powershell")
            .args(["-NoExit", "-Command", &inner_cmd])
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map_err(|e| AppError::Custom(format!("Failed to launch build: {}", e)))?;

        tool_pids().lock().unwrap().insert(pid_key, child.id());
        Ok(())
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

/// Launch the startup executable directly (no console window).
/// `startup_exe` is relative to `worktree_path`.
#[tauri::command]
pub fn run_pr(worktree_path: String, startup_exe: String) -> Result<(), AppError> {
    use std::path::PathBuf;
    let exe = PathBuf::from(&worktree_path).join(&startup_exe);
    Command::new(&exe)
        .current_dir(&worktree_path)
        .spawn()
        .map_err(|e| AppError::Custom(format!("Failed to launch {}: {}", startup_exe, e)))?;
    Ok(())
}

fn build_pr_review_prompt(
    pr_number: u64,
    title: &str,
    url: &str,
    _head_branch: &str,
    base_branch: &str,
) -> String {
    format!(
r#"Run `git diff {base_branch}...pr/{pr_number}` to load the full diff of PR #{pr_number} ("{title}", {url}) into context, then stay ready to answer any questions about the changes."#,
        pr_number = pr_number,
        title = title,
        url = url,
        base_branch = base_branch,
    )
}

/// Open Claude Code in a PR review worktree with a pre-filled review prompt.
#[tauri::command]
pub async fn open_claude_pr_review(
    worktree_path: String,
    worktree_name: String,
    pr_number: u64,
    title: String,
    url: String,
    head_branch: String,
    base_branch: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let pid_key = format!("claude-pr:{}", worktree_name);

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

        let prompt = build_pr_review_prompt(pr_number, &title, &url, &head_branch, &base_branch);

        let temp_dir = std::env::temp_dir();
        let prompt_file = temp_dir.join(format!("claude-pr-{}.txt", worktree_name));
        std::fs::write(&prompt_file, &prompt)
            .map_err(|e| AppError::Custom(format!("Failed to write prompt file: {}", e)))?;

        let inner_cmd = format!(
            "Set-Location '{}'; $p = Get-Content '{}' -Raw; claude --permission-mode auto --model claude-sonnet-4-6 $p",
            worktree_path.replace('\'', "''"),
            prompt_file.to_string_lossy().replace('\'', "''"),
        );

        let child = Command::new("powershell")
            .args(["-NoExit", "-Command", &inner_cmd])
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map_err(|e| AppError::Custom(format!("Failed to open Claude PR review: {}", e)))?;

        tool_pids().lock().unwrap().insert(pid_key, child.id());
        Ok(())
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

/// Build the cascade resolve prompt for Claude Code.
///
/// `branch` — the branch where rebase stopped (has conflicts)
/// `remaining` — list of (branch_name, worktree_path, onto_ref) for branches still to rebase
fn build_cascade_resolve_prompt(
    branch: &str,
    worktree_path: &str,
    remaining: &[(String, String, String)],
    stack_branches: &[String],
) -> String {
    let mut prompt = format!(
r#"Resolve the rebase conflicts in this worktree, then continue the cascade rebase for the remaining stack branches.

Step 1: Resolve conflicts in the current worktree (branch: {branch})
- Review the conflicts: git status, git diff
- Fix the conflicting files
- Stage resolved files: git add <files>
- Run: git rebase --continue
- If new conflicts appear, repeat until the rebase completes

"#
    );

    if !remaining.is_empty() {
        prompt.push_str("Step 2: Cascade rebase remaining branches\nFor each remaining branch (in order):\n");
        for (rem_branch, rem_wt_path, onto_ref) in remaining {
            let wt_unix = rem_wt_path.replace('\\', "/");
            prompt.push_str(&format!(
                "- {rem_branch}: git -C \"{wt_unix}\" rebase --onto {onto_ref} {onto_ref} {rem_branch}\n  If conflicts occur, resolve them (edit files, git add, git rebase --continue).\n"
            ));
        }
        prompt.push('\n');
    }

    let step_num = if remaining.is_empty() { 2 } else { 3 };
    prompt.push_str(&format!(
        "Step {step_num}: Push all rebased branches with --force-with-lease\n"
    ));
    for b in stack_branches {
        prompt.push_str(&format!("- git push --force-with-lease origin {b}\n"));
    }

    let wt_unix = worktree_path.replace('\\', "/");
    prompt.push_str(&format!(
        "\nYou are in: {wt_unix}\nConflicting branch: {branch}\n"
    ));

    prompt
}

/// Open Claude Code with a prompt to resolve cascade rebase conflicts and continue.
#[tauri::command]
pub async fn open_claude_cascade_resolve(
    worktree_path: String,
    worktree_name: String,
    repo_path: String,
    stack_name: String,
    stopped_at_branch: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let pid_key = format!("claude-cascade:{}", worktree_name);

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

        // Read stack metadata to build remaining branches list
        let meta = metadata::read_metadata_v2(&repo_path);
        let stack = meta
            .stacks
            .get(&stack_name)
            .ok_or_else(|| AppError::Custom(format!("Stack '{}' not found", stack_name)))?;

        let stopped_idx = stack
            .branches
            .iter()
            .position(|b| b == &stopped_at_branch)
            .ok_or_else(|| {
                AppError::Custom(format!(
                    "Branch '{}' not found in stack '{}'",
                    stopped_at_branch, stack_name
                ))
            })?;

        // Build remaining branches (those after the stopped one)
        let mut remaining = Vec::new();
        for i in (stopped_idx + 1)..stack.branches.len() {
            let rem_branch = &stack.branches[i];
            let onto_ref = &stack.branches[i - 1];
            if let Some(wt_path) =
                stack_ops::find_worktree_path_for_branch(&repo_path, rem_branch)
            {
                remaining.push((rem_branch.clone(), wt_path, onto_ref.clone()));
            }
        }

        let prompt = build_cascade_resolve_prompt(
            &stopped_at_branch,
            &worktree_path,
            &remaining,
            &stack.branches,
        );

        // Write prompt to a temp file to avoid shell escaping issues
        let temp_dir = std::env::temp_dir();
        let prompt_file = temp_dir.join(format!("claude-cascade-{}.txt", worktree_name));
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
            .map_err(|e| AppError::Custom(format!("Failed to open Claude cascade resolve: {}", e)))?;

        tool_pids().lock().unwrap().insert(pid_key, child.id());

        Ok(())
    })
    .await
    .map_err(|e| AppError::Custom(format!("Task join error: {}", e)))?
}

/// Build the split prompt with full instructions for Claude Code.
fn build_split_prompt(branch_name: &str, repo_path: &str) -> String {
    format!(
r###"Split the branch '{branch}' in '{repo}' into a stacked PR chain.

═══════════════════════════════════════════
PHASE 1 — PLAN  (read-only, no git changes)
═══════════════════════════════════════════

1. ANALYSE: Inspect all uncommitted changes (git status, git diff) and all commits on the branch (git log --oneline {branch} --not origin/master). Read the diffs carefully to understand what each file does.

2. GROUP: Propose a split plan. Group changes into logical PRs ordered by dependency (infra/config → models/types → shared utils → core logic → UI). Apply these rules:
   - Do NOT create a separate "tests" group — each test file goes in the same PR as the source it tests.
   - Strike the right PR size: small enough to review in one sitting, large enough to stand alone. A PR that only adds a handful of types with no consumption in that same PR is too small — merge it with the next group that first uses those types.
   - A good PR tells a self-contained story. If a PR only makes sense after reading the next one, combine them.
   - Exception: a substantial foundational PR (domain models, DB schema) is acceptable on its own if its description explicitly explains how each new type will be consumed in the subsequent PRs.

3. PRESENT THE PLAN: Display the proposed stack in this exact format and then STOP — do not execute anything yet:

   ┌─────────────────────────────────────────────────────────────┐
   │  PROPOSED STACK PLAN                                        │
   ├─────────────────────────────────────────────────────────────┤
   │  Stack: <ticket-id>-stack  (base: master)                   │
   │                                                             │
   │  PR 1 — <short title>                                       │
   │    Files : <list key files/dirs>                            │
   │    Commits: <list commit SHAs + summaries, or "new commit"> │
   │    Rationale: <why this is its own PR>                      │
   │                                                             │
   │  PR 2 — <short title>                                       │
   │    Files : ...                                              │
   │    Commits: ...                                             │
   │    Rationale: ...                                           │
   │                                                             │
   │  (... repeat for each PR ...)                               │
   │                                                             │
   │  Compilation check: each PR must pass dotnet build alone.   │
   │  Any shared dependency is placed in the earliest PR that    │
   │  needs it.                                                  │
   └─────────────────────────────────────────────────────────────┘

   Then ask: "Does this plan look right? You can approve it, ask me to merge/split/reorder PRs, or change which files go where. Type your feedback or 'approved' to proceed."

   ⚠ WAIT for explicit user approval before doing anything in Phase 2.
   If the user requests changes, update the plan and show the revised table again before re-asking.

═══════════════════════════════════════════════════════════════════
PHASE 2 — EXECUTE  (only after the user types 'approved' or similar)
═══════════════════════════════════════════════════════════════════

4. COMMIT: Stage and commit any uncommitted files into well-structured commits grouped by concern, matching the approved plan. Use conventional commit messages.

5. JIRA: Extract the parent Jira ticket ID from the source branch name (e.g. SGD-12345 from feature/SGD-12345-my-feature). Using the Atlassian MCP tool, create a Jira subtask under the parent ticket for EACH PR in the approved plan. Use the PR title as the subtask summary. Collect the new subtask issue keys (e.g. SGD-12346, SGD-12347) — these will be used in branch names.

6. SPLIT: Create a branch + worktree for every PR (including PR 1) as sibling directories to the repo:
   - Every PR in the stack MUST have its own worktree so it can be opened and built independently.
   - PR 1 branches from master; PR N branches from PR N-1's branch.
   - Worktree names: wt-<subtask-key>  (e.g. wt-SGD-12346)
   - Branch names: feature/<subtask-key>-<short-description>  (e.g. feature/SGD-12346-add-models)
   - The feature/ prefix and subtask issue key are MANDATORY for Jira tracking.
   - Each branch includes the test files for its own source code (colocate tests, never bundle them all in one PR).
   - After creating each worktree, run dotnet build to confirm it compiles independently. Fix any issues before continuing.

7. METADATA: The Worktree Explorer app stores metadata in its own data directory (not in the repo). Skip manual metadata updates — the user will register the stack in the Worktree Explorer UI after this session.

8. PUSH + PR: Push all branches with --force-with-lease, then create draft PRs with the correct base chain (gh pr create --draft --base <prev-branch> --head <branch>). Title each PR as '<subtask-key> Part N: <description>'. Look for a PR template at .github/pull_request_template.md and follow its format. Each PR description MUST:
   - Open with a "## Stack" navigation table listing all PRs in the chain with clickable links, marking the current PR with "-->".
   - Include a "## Context" section explaining what this PR does, why it exists, and how it fits the overall feature — written so a reviewer who has not read the other PRs can follow along.
   - For every new class, interface, enum, or service introduced: explicitly state where it is used (this PR or which subsequent PR). A reviewer should never wonder "why does this code exist?".
   - Be specific: instead of "add models", write "Introduces PaymentIntent and PaymentStatus used by the payment service in Part 2 and surfaced in the API response in Part 3."

9. VERIFY: Confirm each branch has the expected changes and no overlap with other groups. Check that each PR, read in isolation, tells a coherent story — if one feels incomplete or context-free, flag it.

10. TEST REPORT: For each PR assess whether tests are needed:
    - Flag PRs that touch business logic, utils, API endpoints, or hooks but have no tests.
    - PRs that are pure config, type-only, or styling changes may not need tests.
    Print a summary:
    ```
    === Test Coverage Report ===
    Part 1 (models/types): No tests needed — type definitions only
    Part 2 (API endpoints): TESTS NEEDED — new endpoint logic, no tests found
    Part 3 (UI components): TESTS NEEDED — component has user interactions
    ```"###,
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
