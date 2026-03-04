import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  checkGhAvailable,
  getStackPrStatuses,
  createStackPrs,
  updateStackPrBases,
  pushStack,
} from "@/lib/tauri";

export function useGhAvailable() {
  return useQuery({
    queryKey: ["gh-available"],
    queryFn: () => checkGhAvailable(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useStackPrStatuses(repoPath: string | null, stackName: string | null) {
  return useQuery({
    queryKey: ["pr-statuses", repoPath, stackName],
    queryFn: () => getStackPrStatuses(repoPath!, stackName!),
    enabled: !!repoPath && !!stackName,
    staleTime: 60 * 1000, // 60 seconds
  });
}

export function useCreateStackPrs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      stackName,
      isDraft,
    }: {
      repoPath: string;
      stackName: string;
      isDraft: boolean;
    }) => createStackPrs(repoPath, stackName, isDraft),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pr-statuses", variables.repoPath, variables.stackName] });
      queryClient.invalidateQueries({ queryKey: ["stacks", variables.repoPath] });
    },
  });
}

export function useUpdateStackPrBases() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      stackName,
    }: {
      repoPath: string;
      stackName: string;
    }) => updateStackPrBases(repoPath, stackName),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pr-statuses", variables.repoPath, variables.stackName] });
    },
  });
}

export function usePushStack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      stackName,
      force,
    }: {
      repoPath: string;
      stackName: string;
      force: boolean;
    }) => pushStack(repoPath, stackName, force),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stack-details", variables.repoPath] });
      queryClient.invalidateQueries({ queryKey: ["worktrees", variables.repoPath] });
    },
  });
}
