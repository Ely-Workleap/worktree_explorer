export interface RepoInfo {
  name: string;
  path: string;
  worktree_count: number;
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string | null;
  base_branch: string | null;
  is_main: boolean;
  is_dirty: boolean;
  is_locked: boolean;
  ahead: number;
  behind: number;
  file_changes: number;
}

export interface MergeResult {
  success: boolean;
  message: string;
}

export interface BranchInfo {
  name: string;
  is_remote: boolean;
  is_head: boolean;
}

export interface CreateWorktreeRequest {
  repo_path: string;
  name: string;
  branch: string | null;
  create_branch: boolean;
  base_branch: string | null;
}
