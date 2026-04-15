import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBuildConfig, setBuildConfig, fileExists } from "@/lib/tauri";
import type { BuildConfig } from "@/types";

export function useBuildConfig(repoPath: string | null) {
  return useQuery({
    queryKey: ["build-config", repoPath],
    queryFn: () => getBuildConfig(repoPath!),
    enabled: !!repoPath,
    staleTime: Infinity, // config only changes when the user saves it
  });
}

export function useExeExists(exePath: string | null) {
  return useQuery({
    queryKey: ["exe-exists", exePath],
    queryFn: () => fileExists(exePath!),
    enabled: !!exePath,
    refetchInterval: false,
  });
}

export function useSetBuildConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ repoPath, config }: { repoPath: string; config: BuildConfig | null }) =>
      setBuildConfig(repoPath, config),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["build-config", variables.repoPath] });
    },
  });
}
