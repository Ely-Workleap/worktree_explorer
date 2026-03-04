import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  listWorktrees,
  createWorktree,
  deleteWorktree,
  mergeBaseBranch,
  rebaseOntoMaster,
  setBaseBranch,
  rebaseContinue,
  rebaseSkip,
  rebaseAbort,
  repairWorktrees,
} from "@/lib/tauri";
import type { CreateWorktreeRequest } from "@/types";

export function useWorktrees(repoPath: string | null) {
  return useQuery({
    queryKey: ["worktrees", repoPath],
    queryFn: () => listWorktrees(repoPath!),
    enabled: !!repoPath,
    placeholderData: keepPreviousData,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
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

export function useRebaseAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      worktreePath,
      action,
    }: {
      repoPath: string;
      worktreePath: string;
      action: "continue" | "skip" | "abort";
    }) => {
      if (action === "continue") return rebaseContinue(worktreePath);
      if (action === "skip") return rebaseSkip(worktreePath);
      return rebaseAbort(worktreePath);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["worktrees", variables.repoPath],
      });
    },
  });
}

export function useRepairWorktrees() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repoPath: string) => repairWorktrees(repoPath),
    onSuccess: (_data, repoPath) => {
      queryClient.invalidateQueries({
        queryKey: ["worktrees", repoPath],
      });
    },
  });
}
