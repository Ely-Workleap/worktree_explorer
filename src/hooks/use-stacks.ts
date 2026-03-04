import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  listStacks,
  getStackDetails,
  createStack,
  addBranchToStack,
  removeBranchFromStack,
  deleteStack,
  renameStack,
  cascadeRebase,
} from "@/lib/tauri";
import type { CreateStackRequest, AddToStackRequest } from "@/types";

export function useStacks(repoPath: string | null) {
  return useQuery({
    queryKey: ["stacks", repoPath],
    queryFn: () => listStacks(repoPath!),
    enabled: !!repoPath,
    placeholderData: keepPreviousData,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

export function useStackDetails(repoPath: string | null, stackName: string | null) {
  return useQuery({
    queryKey: ["stack-details", repoPath, stackName],
    queryFn: () => getStackDetails(repoPath!, stackName!),
    enabled: !!repoPath && !!stackName,
    placeholderData: keepPreviousData,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

export function useCreateStack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateStackRequest) => createStack(request),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stacks", variables.repo_path] });
      queryClient.invalidateQueries({ queryKey: ["worktrees", variables.repo_path] });
      queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
  });
}

export function useAddBranchToStack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AddToStackRequest) => addBranchToStack(request),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stacks", variables.repo_path] });
      queryClient.invalidateQueries({ queryKey: ["stack-details", variables.repo_path] });
      queryClient.invalidateQueries({ queryKey: ["worktrees", variables.repo_path] });
      queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
  });
}

export function useRemoveBranchFromStack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      stackName,
      branch,
      deleteWorktree,
    }: {
      repoPath: string;
      stackName: string;
      branch: string;
      deleteWorktree: boolean;
    }) => removeBranchFromStack(repoPath, stackName, branch, deleteWorktree),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stacks", variables.repoPath] });
      queryClient.invalidateQueries({ queryKey: ["stack-details", variables.repoPath] });
      queryClient.invalidateQueries({ queryKey: ["worktrees", variables.repoPath] });
      queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
  });
}

export function useDeleteStack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      stackName,
      deleteWorktrees,
    }: {
      repoPath: string;
      stackName: string;
      deleteWorktrees: boolean;
    }) => deleteStack(repoPath, stackName, deleteWorktrees),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stacks", variables.repoPath] });
      queryClient.invalidateQueries({ queryKey: ["stack-details", variables.repoPath] });
      queryClient.invalidateQueries({ queryKey: ["worktrees", variables.repoPath] });
      queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
  });
}

export function useRenameStack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      oldName,
      newName,
    }: {
      repoPath: string;
      oldName: string;
      newName: string;
    }) => renameStack(repoPath, oldName, newName),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stacks", variables.repoPath] });
      queryClient.invalidateQueries({ queryKey: ["stack-details", variables.repoPath] });
    },
  });
}

export function useCascadeRebase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      stackName,
    }: {
      repoPath: string;
      stackName: string;
    }) => cascadeRebase(repoPath, stackName),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stack-details", variables.repoPath] });
      queryClient.invalidateQueries({ queryKey: ["worktrees", variables.repoPath] });
    },
  });
}
