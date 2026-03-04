# CLAUDE.md

## Project Overview

Worktree Explorer is a Tauri v2 desktop app for managing Git worktrees and **stacked PRs** on Windows. It has a Rust backend using the `git2` crate and a React/TypeScript frontend.

## Build & Run

- **Dev mode**: `build.bat dev`
- **Build + installer**: `build.bat build`
- **Cargo check**: `build.bat check`
- **TypeScript check**: `build.bat tsc`
- **Clean**: `build.bat clean`
- The MSVC toolchain is at a non-standard path: `C:\Program Files\Microsoft Visual Studio\18\Professional`
- `build.bat` sets PATH, LIB, and INCLUDE env vars to locate MSVC tools

## Architecture

### Rust Backend (`src-tauri/src/`)

- **`error.rs`** — `AppError` enum using thiserror, implements Serialize for Tauri
- **`models.rs`** — Shared data structs: `RepoInfo`, `WorktreeInfo`, `BranchInfo`, `StackInfo`, `StackBranchInfo`, `PrStatus`, `CascadeRebaseResult`, `SplitPlan`, `SplitGroup`, `SplitResult`, etc.
- **`git/scanner.rs`** — Recursive repo discovery using walkdir. Skips: node_modules, target, .git, dist, build, .next, __pycache__, .venv, vendor
- **`git/status.rs`** — Dirty check via `repo.statuses()`, ahead/behind via `graph_ahead_behind`
- **`git/worktree_ops.rs`** — Worktree CRUD + merge/rebase. Worktrees created as sibling directories to the repo. Exports `rebase_onto()` helper for generic rebase operations.
- **`git/metadata.rs`** — Reads/writes `.worktree-meta.json` V2 format at repo root. Handles auto-migration from V1. Stack CRUD functions.
- **`git/stack_ops.rs`** — Stack business logic: create/add/remove/delete stacks, cascade rebase, stack details with live status
- **`git/split_ops.rs`** — Split plan execution: takes a structured plan and creates branches/worktrees/stack atomically with rollback
- **`git/github.rs`** — GitHub integration via `gh` CLI: PR status, create PRs, update PR bases, force-push
- **`commands/`** — Tauri command handlers that delegate to git modules

### React Frontend (`src/`)

- **State management**: TanStack React Query for all data fetching/mutations with cache invalidation
- **UI components**: shadcn/ui (Radix primitives + Tailwind). Searchable combobox uses `cmdk`
- **Settings**: Root folder path persisted via `@tauri-apps/plugin-store`
- **Theme**: Dark/light toggle via `.dark` class on `<html>`, persisted in localStorage
- **Tab navigation**: MainPanel has Worktrees and Stacks tabs
- **Stack UI**: `src/components/stack/` — StackList, StackCard, StackBranchRow, CreateStackDialog, AddBranchDialog, DeleteStackDialog, PrStatusBadge

### Tauri Commands

| Command | Purpose |
|---------|---------|
| `scan_repos` | Walk dirs, find repos with worktrees |
| `list_worktrees` | List all worktrees + status for a repo |
| `create_worktree` | Create worktree on new/existing branch |
| `delete_worktree` | Prune worktree + remove directory |
| `merge_base_branch` | Shell out to `git merge` in worktree |
| `rebase_onto_master` | Rebase worktree onto origin/master |
| `set_base_branch` | Update base branch in metadata |
| `rebase_continue/skip/abort` | Rebase conflict resolution |
| `repair_worktrees` | Fix broken worktree links |
| `list_branches` | List local + remote branches |
| `list_stacks` | List all stacks for a repo |
| `get_stack_details` | Get enriched branch info for a stack |
| `create_stack` | Create stack + first branch/worktree |
| `add_branch_to_stack` | Add branch to existing stack |
| `remove_branch_from_stack` | Remove branch, optionally delete worktree |
| `delete_stack` | Delete stack, optionally delete all worktrees |
| `rename_stack` | Rename a stack |
| `cascade_rebase` | Rebase each branch onto its predecessor |
| `split_into_stack` | Split a branch into a stack of smaller branches |
| `check_gh_available` | Check if `gh` CLI is installed |
| `get_stack_pr_statuses` | Fetch PR statuses for all branches in a stack |
| `create_stack_prs` | Create GitHub PRs for branches without one |
| `update_stack_pr_bases` | Update PR base branches to match stack order |
| `push_stack` | Push all branches in a stack |
| `open_in_vscode` | `code <path>` |
| `open_in_visual_studio` | `start devenv <path>` |
| `open_in_explorer` | `explorer <path>` |
| `open_terminal_tool` | Open Claude/Codex/Lazygit in new terminal |

## Stack Metadata (`.worktree-meta.json`)

The metadata file at the repo root uses V2 format (auto-migrates from V1):

```json
{
  "version": 2,
  "worktrees": {
    "wt-name": { "base_branch": "master" }
  },
  "stacks": {
    "my-stack": {
      "name": "my-stack",
      "root_branch": "master",
      "branches": ["feature/part1", "feature/part2"],
      "pr_numbers": { "feature/part1": 42, "feature/part2": null }
    }
  }
}
```

### Creating a stack from the CLI (e.g., from Claude Code)

To create a stack manually without the GUI:

1. **Create branches and worktrees:**
   ```bash
   # From the repo root's parent directory
   cd <repo-parent>

   # Create first branch from master
   git -C <repo> branch feature/part1 master
   git -C <repo> worktree add ../wt-part1 feature/part1

   # Create second branch from first
   git -C <repo> branch feature/part2 feature/part1
   git -C <repo> worktree add ../wt-part2 feature/part2
   ```

2. **Update `.worktree-meta.json`** in the repo root:
   ```json
   {
     "version": 2,
     "worktrees": {
       "wt-part1": { "base_branch": "master" },
       "wt-part2": { "base_branch": "feature/part1" }
     },
     "stacks": {
       "my-stack": {
         "name": "my-stack",
         "root_branch": "master",
         "branches": ["feature/part1", "feature/part2"],
         "pr_numbers": {}
       }
     }
   }
   ```

3. **Cascade rebase** (after root branch updates):
   ```bash
   git -C <repo> fetch origin master
   # Rebase each branch onto its predecessor, bottom to top
   git -C ../wt-part1 rebase --onto origin/master <merge-base> feature/part1
   git -C ../wt-part2 rebase --onto feature/part1 <merge-base> feature/part2
   ```

4. **Push + create PRs:**
   ```bash
   git -C ../wt-part1 push --force-with-lease origin feature/part1
   git -C ../wt-part2 push --force-with-lease origin feature/part2
   gh pr create --base master --head feature/part1 --title "Part 1"
   gh pr create --base feature/part1 --head feature/part2 --title "Part 2"
   ```

Key rules:
- `branches` array is ordered bottom-to-top (index 0 = closest to root)
- Each branch's base = previous branch in the array (or `root_branch` for index 0)
- Worktree names in `worktrees` must match the git worktree name
- The app auto-migrates V1 format (flat `{ "wt-name": "base-branch" }`) to V2 on next read

### Auto-splitting a worktree into a stacked PR chain

When asked to split a worktree (or branch) into a stack of smaller PRs, follow this protocol:

#### Step 1 — Assess

1. Identify the **source branch** (the branch with all the changes) and its **base/root branch** (usually `master` or `main`).
2. Detect the scenario:
   - **Scenario A (multi-commit):** The source branch has multiple well-structured commits. Each commit (or group of related commits) can become a stack layer. Use cherry-pick.
   - **Scenario B (single-commit or uncommitted):** All changes are in one commit or uncommitted. Split by file paths. Use file checkout.
3. Create a safety backup: the `split_into_stack` command automatically creates `backup/<source_branch>` before making changes.

#### Step 2 — Analyze

Read the diffs and group changes by logical concern. Use these categories in **dependency order** (earlier groups must not depend on later ones):

1. **Infrastructure/config** — `package.json`, `Cargo.toml`, CI files, build scripts
2. **Schema/migrations/models** — database migrations, data model changes, type definitions
3. **Shared utilities/helpers** — new utility functions, shared modules
4. **Core business logic** — backend logic, API endpoints, service layer
5. **UI/presentation layer** — components, styles, frontend routing
6. **Tests** — test files for the above categories

For **Scenario A**: map each commit SHA to a group based on what it changes.
For **Scenario B**: map each file path to a group based on its category.

**Shared file rule:** If a file is needed by multiple groups, place it in the **earliest** group.

#### Step 3 — Propose

Present the split plan to the user before executing. Include:
- Stack name
- For each group (in order):
  - Branch name (e.g., `feature/ticket-123-part1-models`)
  - Worktree name (e.g., `wt-ticket-123-part1`)
  - Description (will become the commit message for Scenario B)
  - List of commits (Scenario A) or files (Scenario B)

**Wait for user confirmation before proceeding.**

#### Step 4 — Execute

Call the `split_into_stack` Tauri command with the plan:

```typescript
// SplitPlan structure
{
  repo_path: "/path/to/repo",
  source_branch: "feature/big-change",
  stack_name: "ticket-123",
  root_branch: "master",
  groups: [
    {
      branch_name: "feature/ticket-123-part1-models",
      worktree_name: "wt-ticket-123-part1",
      description: "Add data models for ticket 123",
      commits: ["abc123", "def456"],  // Scenario A
      files: []
    },
    {
      branch_name: "feature/ticket-123-part2-api",
      worktree_name: "wt-ticket-123-part2",
      description: "Add API endpoints for ticket 123",
      commits: [],
      files: ["src/api/endpoint.rs", "src/api/mod.rs"]  // Scenario B
    }
  ]
}
```

If outside the Tauri app, use manual git commands instead:

```bash
# For each group i (0-indexed):
base=$(if [ $i -eq 0 ]; then echo "master"; else echo "${groups[$((i-1))]_branch}"; fi)
git -C <repo> branch <group_branch> $base
git -C <repo> worktree add ../<wt_name> <group_branch>

# Scenario A: cherry-pick
git -C ../<wt_name> cherry-pick <sha1> <sha2> ...

# Scenario B: checkout files + commit
git -C ../<wt_name> checkout <source_branch> -- <file1> <file2> ...
git -C ../<wt_name> add -A
git -C ../<wt_name> commit -m "<description>"
```

Then update `.worktree-meta.json` manually (see "Creating a stack from the CLI" above).

#### Step 5 — Verify

After execution, verify each branch:
1. Has the expected file changes (`git -C <wt_path> diff --stat <base>`)
2. Does not contain changes that belong to other groups
3. Compiles independently (if applicable — run build/typecheck per worktree)

#### Step 6 — Push/PR (optional)

If the user wants to push and create PRs:

```bash
# Push all branches
git -C <wt1> push --force-with-lease origin <branch1>
git -C <wt2> push --force-with-lease origin <branch2>

# Create PRs with correct base chain
gh pr create --base master --head <branch1> --title "Part 1: ..."
gh pr create --base <branch1> --head <branch2> --title "Part 2: ..."
```

Or use the existing stack commands: `push_stack` then `create_stack_prs`.

#### Safety rules

- **Always backup first** — the command creates `backup/<source_branch>` automatically
- **Never auto-resolve conflicts** — if cherry-pick or checkout fails, rollback and report
- **Each branch must compile alone** — shared dependencies go in the earliest group
- **Files shared across groups go in the earliest group** — later groups depend on earlier ones
- **Rollback on failure** — if any step fails, all created worktrees and branches are removed
- **Don't mix scenarios** — each group uses either `commits` OR `files`, never both

## Key Patterns

- git2's `StringArray` doesn't implement `Default` — use `match` instead of `unwrap_or_default()`
- git2's `Worktree::is_locked()` returns `Result<WorktreeLockStatus, Error>` not `bool` — use `.map(|s| !matches!(s, WorktreeLockStatus::Unlocked)).unwrap_or(false)`
- Tauri window may not show on launch — force `win.show()` + `win.set_focus()` in `setup()` callback
- For scrollable flex layouts, use `min-h-0 flex-1 overflow-y-auto` (not Radix ScrollArea)
- Git doesn't track parent branches — we store this in `.worktree-meta.json` at repo root
- Merge/rebase uses `git` CLI (`std::process::Command`) rather than git2's low-level API for robustness
- `rebase_onto(worktree_path, onto_ref, old_base_ref)` is the generic rebase helper used by both single-worktree rebase and cascade rebase
- GitHub integration shells out to `gh` CLI (same pattern as using git CLI for complex ops)

## Code Style

- Rust: 2021 edition, thiserror for errors, serde for serialization
- TypeScript: strict mode, path aliases (`@/` -> `src/`), React Query for async state
- CSS: Tailwind v4 with `@custom-variant dark (&:is(.dark *))` for dark mode
- Components: functional React with hooks, shadcn/ui patterns
