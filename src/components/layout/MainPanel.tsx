import { GitFork } from "lucide-react";
import { WorktreeList } from "@/components/worktree/WorktreeList";

interface MainPanelProps {
  selectedRepo: string | null;
}

export function MainPanel({ selectedRepo }: MainPanelProps) {
  if (!selectedRepo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <GitFork className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Select a repository to view its worktrees.
        </p>
      </div>
    );
  }

  return <WorktreeList repoPath={selectedRepo} />;
}
