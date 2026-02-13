import { useQuery } from "@tanstack/react-query";
import { scanRepos } from "@/lib/tauri";

export function useRepos(rootPath: string | null) {
  return useQuery({
    queryKey: ["repos", rootPath],
    queryFn: () => scanRepos(rootPath!),
    enabled: !!rootPath,
  });
}
