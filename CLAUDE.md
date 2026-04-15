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
- **`git/metadata.rs`** — Reads/writes per-repo metadata JSON in the app data directory (`%LOCALAPPDATA%/com.worktreeexplorer.app/metadata/`). Uses `OnceLock` for path init. Auto-migrates legacy `.worktree-meta.json` from repo root on first read. Stack CRUD functions.
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

## Stack Metadata

Metadata is stored in the **app data directory**, not in the repo. Each repo gets its own JSON file keyed by a hash of its canonical path:

```
%LOCALAPPDATA%/com.worktreeexplorer.app/metadata/
  <hash>.json          # one per repo
  _index.json          # maps hash -> repo path (for debugging)
```

Legacy `.worktree-meta.json` files at repo roots are auto-migrated on first read (imported then deleted).

The V2 JSON format:

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

2. **Register in the Worktree Explorer app** — the app stores metadata in its own data directory (`%LOCALAPPDATA%/com.worktreeexplorer.app/metadata/`). Open the app and use the Stacks UI to create the stack and assign branches. Alternatively, if running from within the Tauri app, the `create_stack` and `add_branch_to_stack` commands handle this automatically.

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
- The app auto-migrates legacy `.worktree-meta.json` from repo root on first read (imports then deletes)

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

1. **Infrastructure/config** — `.csproj` files, NuGet packages, CI files, build scripts, `Program.cs` / DI registration changes
2. **Schema/migrations/models** — EF migrations, entity classes, DTOs, enums, interfaces, value objects
3. **Shared utilities/helpers** — extension methods, shared services, base classes, common attributes
4. **Core business logic** — domain services, handlers, repositories, API controllers
5. **UI/presentation layer** — Razor views, Blazor components, frontend assets
6. **Tests** — test files for the above categories

For **Scenario A**: map each commit SHA to a group based on what it changes.
For **Scenario B**: map each file path to a group based on its category.

**Shared file rule:** If a file is needed by multiple groups, place it in the **earliest** group.

**Compilability rule:** Every PR in the stack must compile and build successfully on its own (i.e., when checked out independently on top of its base branch). When grouping:
- If a group adds code that references types/classes/interfaces from a later group, pull those dependencies into the current group or an earlier one.
- If moving a dependency earlier would bloat that group, consider merging the two groups instead.
- Run `dotnet build` in each worktree to verify compilation (adapt to the project's build system if different).
- Include any necessary `using` directives, project references, or namespace updates so the compiler finds everything.
- Watch out for partial classes, extension methods, and DI registrations that may span multiple files — keep them together or ensure the earlier group has everything needed to compile.

#### Step 3 — Propose

Present the split plan to the user before executing. Include:
- Stack name
- For each group (in order):
  - Branch name (e.g., `feature/ticket-123-part1-models`)
  - Worktree name (e.g., `wt-ticket-123-part1`)
  - Description (will become the commit message for Scenario B)
  - List of commits (Scenario A) or files (Scenario B)

**Forward-reference rule for foundational PRs:** If a group only introduces types, enums, structs, or classes that are **not yet consumed** within that same PR, the description **must** explain where they will be used in later PRs of the stack. Example:
> "Add `PrStatus` enum and `StackBranchInfo` struct — these are used by the stack details query in PR #3 and the UI in PR #4."

This gives reviewers context for why the code exists even though nothing calls it yet.

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

Then register the stack in the Worktree Explorer app (see "Creating a stack from the CLI" above).

#### Step 5 — Verify

After execution, verify **each** branch compiles and is correct:
1. Has the expected file changes (`git -C <wt_path> diff --stat <base>`)
2. Does not contain changes that belong to other groups
3. **Must compile independently** — run `dotnet build` (or the project's build command) in each worktree. If a branch fails to compile, fix it before proceeding (add missing `using` directives, move dependencies to an earlier group, add project references, etc.)
4. For foundational PRs (types/enums only), confirm the description references which later PRs consume them

#### Step 6 — Push/PR (optional)

If the user wants to push and create PRs:

```bash
# Push all branches
git -C <wt1> push --force-with-lease origin <branch1>
git -C <wt2> push --force-with-lease origin <branch2>

# Create PRs with correct base chain
gh pr create --base master --head <branch1> --title "Part 1: ..." --body "..."
gh pr create --base <branch1> --head <branch2> --title "Part 2: ..." --body "..."
```

Or use the existing stack commands: `push_stack` then `create_stack_prs`.

**Stack navigation in PR descriptions:** Every PR body **must** include a navigation section at the top listing all PRs in the stack with clickable links. The current PR is marked with an arrow. Use this format:

```markdown
## Stack

| | PR | Description |
|---|---|---|
| | [#101 — Part 1: Add domain models](https://github.com/org/repo/pull/101) | Enums, DTOs, entities |
| **-->** | **#102 — Part 2: Add service layer** *(this PR)* | Handlers and repositories |
| | [#103 — Part 3: Add API controllers](https://github.com/org/repo/pull/103) | REST endpoints |

---
```

**Creation flow** (PRs must be created bottom-to-top so earlier PR numbers are known):
1. Create all PRs in stack order (PR 1 first, then PR 2, etc.) — capture each PR URL from `gh pr create` output.
2. After all PRs exist, update every PR body with `gh pr edit <number> --body "..."` to inject the full navigation table with all links.

For foundational PRs (types/enums only), the description column should note what later PRs consume them, e.g.: "Enums and DTOs — used by service layer in #102 and controllers in #103".

#### Safety rules

- **Always backup first** — the command creates `backup/<source_branch>` automatically
- **Never auto-resolve conflicts** — if cherry-pick or checkout fails, rollback and report
- **Each branch must compile alone** — shared dependencies go in the earliest group. Run `dotnet build` per worktree and fix any errors before moving on
- **Files shared across groups go in the earliest group** — later groups depend on earlier ones
- **Rollback on failure** — if any step fails, all created worktrees and branches are removed
- **Don't mix scenarios** — each group uses either `commits` OR `files`, never both

## Key Patterns

- git2's `StringArray` doesn't implement `Default` — use `match` instead of `unwrap_or_default()`
- git2's `Worktree::is_locked()` returns `Result<WorktreeLockStatus, Error>` not `bool` — use `.map(|s| !matches!(s, WorktreeLockStatus::Unlocked)).unwrap_or(false)`
- Tauri window may not show on launch — force `win.show()` + `win.set_focus()` in `setup()` callback
- For scrollable flex layouts, use `min-h-0 flex-1 overflow-y-auto` (not Radix ScrollArea)
- Git doesn't track parent branches — we store this in per-repo metadata in the app data directory (not in the repo itself)
- Merge/rebase uses `git` CLI (`std::process::Command`) rather than git2's low-level API for robustness
- `rebase_onto(worktree_path, onto_ref, old_base_ref)` is the generic rebase helper used by both single-worktree rebase and cascade rebase
- GitHub integration shells out to `gh` CLI (same pattern as using git CLI for complex ops)

## Code Style

- Rust: 2021 edition, thiserror for errors, serde for serialization
- TypeScript: strict mode, path aliases (`@/` -> `src/`), React Query for async state
- CSS: Tailwind v4 with `@custom-variant dark (&:is(.dark *))` for dark mode
- Components: functional React with hooks, shadcn/ui patterns
