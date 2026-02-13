import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listWorktrees,
  createWorktree,
  deleteWorktree,
  mergeBaseBranch,
  rebaseOntoMaster,
  setBaseBranch,
} from "@/lib/tauri";
import type { CreateWorktreeRequest } from "@/types";

export function useWorktrees(repoPath: string | null) {
  return useQuery({
    queryKey: ["worktrees", repoPath],
    queryFn: () => listWorktrees(repoPath!),
    enabled: !!repoPath,
  });
}

export function useCreateWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateWorktreeRequest) => createWorktree(request),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["worktrees", variables.repo_path],
      });
      queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
  });
}

export function useDeleteWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      worktreeName,
    }: {
      repoPath: string;
      worktreeName: string;
    }) => deleteWorktree(repoPath, worktreeName),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["worktrees", variables.repoPath],
      });
      queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
  });
}

export function useMergeBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      worktreePath,
      baseBranch,
    }: {
      repoPath: string;
      worktreePath: string;
      baseBranch: string;
    }) => mergeBaseBranch(repoPath, worktreePath, baseBranch),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["worktrees", variables.repoPath],
      });
    },
  });
}

export function useRebaseOntoMaster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      worktreePath,
      baseBranch,
    }: {
      repoPath: string;
      worktreePath: string;
      baseBranch: string;
    }) => rebaseOntoMaster(repoPath, worktreePath, baseBranch),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["worktrees", variables.repoPath],
      });
    },
  });
}

export function useSetBaseBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      worktreeName,
      baseBranch,
    }: {
      repoPath: string;
      worktreeName: string;
      baseBranch: string;
    }) => setBaseBranch(repoPath, worktreeName, baseBranch),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["worktrees", variables.repoPath],
      });
    },
  });
}
