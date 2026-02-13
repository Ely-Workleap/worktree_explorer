import { useQuery } from "@tanstack/react-query";
import { listBranches } from "@/lib/tauri";

export function useBranches(repoPath: string | null) {
  return useQuery({
    queryKey: ["branches", repoPath],
    queryFn: () => listBranches(repoPath!),
    enabled: !!repoPath,
  });
}
