import { invoke } from "@tauri-apps/api/core";
import type {
  RepoInfo,
  WorktreeInfo,
  BranchInfo,
  CreateWorktreeRequest,
  MergeResult,
  StackInfo,
  StackBranchInfo,
  CreateStackRequest,
  AddToStackRequest,
  CascadeRebaseResult,
  PrStatus,
  SplitPlan,
  SplitResult,
} from "@/types";

// --- Existing commands ---

export async function scanRepos(rootPath: string): Promise<RepoInfo[]> {
  return invoke("scan_repos", { rootPath });
}

export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  return invoke("list_worktrees", { repoPath });
}

export async function createWorktree(
  request: CreateWorktreeRequest,
): Promise<WorktreeInfo> {
  return invoke("create_worktree", { request });
}

export async function deleteWorktree(
  repoPath: string,
  worktreeName: string,
): Promise<void> {
  return invoke("delete_worktree", { repoPath, worktreeName });
}

export async function listBranches(repoPath: string): Promise<BranchInfo[]> {
  return invoke("list_branches", { repoPath });
}

export async function mergeBaseBranch(
  repoPath: string,
  worktreePath: string,
  baseBranch: string,
): Promise<MergeResult> {
  return invoke("merge_base_branch", { repoPath, worktreePath, baseBranch });
}

export async function setBaseBranch(
  repoPath: string,
  worktreeName: string,
  baseBranch: string,
): Promise<void> {
  return invoke("set_base_branch", { repoPath, worktreeName, baseBranch });
}

export async function rebaseOntoMaster(
  repoPath: string,
  worktreePath: string,
  baseBranch: string,
): Promise<MergeResult> {
  return invoke("rebase_onto_master", { repoPath, worktreePath, baseBranch });
}

export async function rebaseContinue(worktreePath: string): Promise<MergeResult> {
  return invoke("rebase_continue", { worktreePath });
}

export async function rebaseSkip(worktreePath: string): Promise<MergeResult> {
  return invoke("rebase_skip", { worktreePath });
}

export async function rebaseAbort(worktreePath: string): Promise<MergeResult> {
  return invoke("rebase_abort", { worktreePath });
}

export async function repairWorktrees(repoPath: string): Promise<string> {
  return invoke("repair_worktrees", { repoPath });
}

export async function openInVscode(path: string): Promise<void> {
  return invoke("open_in_vscode", { path });
}

export async function openInVisualStudio(path: string): Promise<void> {
  return invoke("open_in_visual_studio", { path });
}

export async function openInExplorer(path: string): Promise<void> {
  return invoke("open_in_explorer", { path });
}

export async function openTerminalTool(
  path: string,
  worktreeName: string,
  tool: "claude" | "codex" | "lazygit",
): Promise<void> {
  return invoke("open_terminal_tool", { path, worktreeName, tool });
}

export async function openClaudeSplit(
  worktreePath: string,
  worktreeName: string,
  repoPath: string,
  branchName: string,
): Promise<void> {
  return invoke("open_claude_split", { worktreePath, worktreeName, repoPath, branchName });
}

// --- Stack commands ---

export async function listStacks(repoPath: string): Promise<StackInfo[]> {
  return invoke("list_stacks", { repoPath });
}

export async function getStackDetails(
  repoPath: string,
  stackName: string,
): Promise<StackBranchInfo[]> {
  return invoke("get_stack_details", { repoPath, stackName });
}

export async function createStack(
  request: CreateStackRequest,
): Promise<StackInfo> {
  return invoke("create_stack", { request });
}

export async function addBranchToStack(
  request: AddToStackRequest,
): Promise<StackInfo> {
  return invoke("add_branch_to_stack", { request });
}

export async function removeBranchFromStack(
  repoPath: string,
  stackName: string,
  branch: string,
  deleteWorktree: boolean,
): Promise<StackInfo> {
  return invoke("remove_branch_from_stack", {
    repoPath,
    stackName,
    branch,
    deleteWorktree,
  });
}

export async function deleteStack(
  repoPath: string,
  stackName: string,
  deleteWorktrees: boolean,
): Promise<void> {
  return invoke("delete_stack", { repoPath, stackName, deleteWorktrees });
}

export async function renameStack(
  repoPath: string,
  oldName: string,
  newName: string,
): Promise<StackInfo> {
  return invoke("rename_stack", { repoPath, oldName, newName });
}

export async function cascadeRebase(
  repoPath: string,
  stackName: string,
): Promise<CascadeRebaseResult> {
  return invoke("cascade_rebase", { repoPath, stackName });
}

// --- Split commands ---

export async function splitIntoStack(
  plan: SplitPlan,
): Promise<SplitResult> {
  return invoke("split_into_stack", { plan });
}

// --- GitHub commands ---

export async function checkGhAvailable(): Promise<boolean> {
  return invoke("check_gh_available");
}

export async function getStackPrStatuses(
  repoPath: string,
  stackName: string,
): Promise<Record<string, PrStatus>> {
  return invoke("get_stack_pr_statuses", { repoPath, stackName });
}

export async function createStackPrs(
  repoPath: string,
  stackName: string,
  isDraft: boolean,
): Promise<PrStatus[]> {
  return invoke("create_stack_prs", { repoPath, stackName, isDraft });
}

export async function updateStackPrBases(
  repoPath: string,
  stackName: string,
): Promise<void> {
  return invoke("update_stack_pr_bases", { repoPath, stackName });
}

export async function pushStack(
  repoPath: string,
  stackName: string,
  force: boolean,
): Promise<string[]> {
  return invoke("push_stack", { repoPath, stackName, force });
}
