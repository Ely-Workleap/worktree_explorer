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
  stack_name: string | null;
  is_main: boolean;
  is_dirty: boolean;
  is_locked: boolean;
  is_rebasing: boolean;
  ahead: number;
  behind: number;
  file_changes: number;
}

export interface MergeResult {
  success: boolean;
  has_conflicts: boolean;
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

// --- Stack types ---

export interface StackInfo {
  name: string;
  root_branch: string;
  branches: string[];
  pr_numbers: Record<string, number | null>;
}

export interface StackBranchInfo {
  branch: string;
  worktree_name: string | null;
  worktree_path: string | null;
  pr_number: number | null;
  is_dirty: boolean;
  is_rebasing: boolean;
  ahead: number;
  behind: number;
  file_changes: number;
  position: number;
}

export interface PrStatus {
  number: number;
  title: string;
  state: string;
  review_decision: string | null;
  url: string;
  base_branch: string;
  is_draft: boolean;
  checks_status: string | null;
}

export interface CascadeRebaseResult {
  results: CascadeRebaseStep[];
  stopped_at: string | null;
}

export interface CascadeRebaseStep {
  branch: string;
  success: boolean;
  has_conflicts: boolean;
  message: string;
}

export interface CreateStackRequest {
  repo_path: string;
  stack_name: string;
  root_branch: string;
  initial_branch: string;
  worktree_name: string;
}

export interface AddToStackRequest {
  repo_path: string;
  stack_name: string;
  branch_name: string;
  worktree_name: string;
  position: number | null;
}

// --- Split types ---

export interface SplitGroup {
  branch_name: string;
  worktree_name: string;
  description: string;
  commits: string[];
  files: string[];
}

export interface SplitPlan {
  repo_path: string;
  source_branch: string;
  stack_name: string;
  root_branch: string;
  groups: SplitGroup[];
}

export interface SplitResult {
  stack: StackInfo;
  branches_created: string[];
  worktrees_created: string[];
  backup_branch: string;
}
