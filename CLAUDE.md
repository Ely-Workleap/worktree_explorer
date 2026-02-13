# CLAUDE.md

## Project Overview

Worktree Explorer is a Tauri v2 desktop app for managing Git worktrees on Windows. It has a Rust backend using the `git2` crate and a React/TypeScript frontend.

## Build & Run

- **Dev mode**: `run.bat` (sets up MSVC env vars, then runs `npm run tauri dev`)
- **Build**: `build.bat build`
- **Cargo check only**: Use `check.ps1` (PowerShell script that sets MSVC env and runs `cargo check`)
- The MSVC toolchain is at a non-standard path: `C:\Program Files\Microsoft Visual Studio\18\Professional`
- Build scripts (`build.bat`, `run.bat`) set PATH, LIB, and INCLUDE env vars to locate MSVC tools

## Architecture

### Rust Backend (`src-tauri/src/`)

- **`error.rs`** — `AppError` enum using thiserror, implements Serialize for Tauri
- **`models.rs`** — Shared data structs: `RepoInfo`, `WorktreeInfo`, `BranchInfo`, `CreateWorktreeRequest`, `MergeResult`
- **`git/scanner.rs`** — Recursive repo discovery using walkdir. Skips: node_modules, target, .git, dist, build, .next, __pycache__, .venv, vendor
- **`git/status.rs`** — Dirty check via `repo.statuses()`, ahead/behind via `graph_ahead_behind`
- **`git/worktree_ops.rs`** — Worktree CRUD + merge. Worktrees created as sibling directories to the repo
- **`git/metadata.rs`** — Reads/writes `.worktree-meta.json` at repo root to store base branch per worktree
- **`commands/`** — Tauri command handlers that delegate to git modules

### React Frontend (`src/`)

- **State management**: TanStack React Query for all data fetching/mutations with cache invalidation
- **UI components**: shadcn/ui (Radix primitives + Tailwind). Searchable combobox uses `cmdk`
- **Settings**: Root folder path persisted via `@tauri-apps/plugin-store`
- **Theme**: Dark/light toggle via `.dark` class on `<html>`, persisted in localStorage

### Tauri Commands

| Command | Purpose |
|---------|---------|
| `scan_repos` | Walk dirs, find repos with worktrees |
| `list_worktrees` | List all worktrees + status for a repo |
| `create_worktree` | Create worktree on new/existing branch |
| `delete_worktree` | Prune worktree + remove directory |
| `merge_base_branch` | Shell out to `git merge` in worktree |
| `list_branches` | List local + remote branches |
| `open_in_vscode` | `code <path>` |
| `open_in_visual_studio` | `start devenv <path>` |
| `open_in_explorer` | `explorer <path>` |
| `open_in_terminal` | PowerShell in new window |

## Key Patterns

- git2's `StringArray` doesn't implement `Default` — use `match` instead of `unwrap_or_default()`
- git2's `Worktree::is_locked()` returns `Result<WorktreeLockStatus, Error>` not `bool` — use `.map(|s| !matches!(s, WorktreeLockStatus::Unlocked)).unwrap_or(false)`
- Tauri window may not show on launch — force `win.show()` + `win.set_focus()` in `setup()` callback
- For scrollable flex layouts, use `min-h-0 flex-1 overflow-y-auto` (not Radix ScrollArea)
- Git doesn't track parent branches — we store this in `.worktree-meta.json` at repo root
- Merge uses `git` CLI (`std::process::Command`) rather than git2's low-level merge API for robustness

## Code Style

- Rust: 2021 edition, thiserror for errors, serde for serialization
- TypeScript: strict mode, path aliases (`@/` -> `src/`), React Query for async state
- CSS: Tailwind v4 with `@custom-variant dark (&:is(.dark *))` for dark mode
- Components: functional React with hooks, shadcn/ui patterns
