import { invoke } from "@tauri-apps/api/core";
import type {
  RepoInfo,
  WorktreeInfo,
  BranchInfo,
  CreateWorktreeRequest,
  MergeResult,
} from "@/types";

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

export async function openInVscode(path: string): Promise<void> {
  return invoke("open_in_vscode", { path });
}

export async function openInVisualStudio(path: string): Promise<void> {
  return invoke("open_in_visual_studio", { path });
}

export async function openInExplorer(path: string): Promise<void> {
  return invoke("open_in_explorer", { path });
}

export async function openInTerminal(path: string): Promise<void> {
  return invoke("open_in_terminal", { path });
}
