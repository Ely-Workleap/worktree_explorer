import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorktreeCard } from "./WorktreeCard";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { useWorktrees } from "@/hooks/use-worktrees";

interface WorktreeListProps {
  repoPath: string;
}

export function WorktreeList({ repoPath }: WorktreeListProps) {
  const { data: worktrees, isLoading, error } = useWorktrees(repoPath);
  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-destructive">
          Failed to load worktrees: {(error as Error).message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 p-4">
          {worktrees?.map((wt) => (
            <WorktreeCard key={wt.path} worktree={wt} repoPath={repoPath} />
          ))}
        </div>
      </div>
      <div className="border-t p-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Worktree
        </Button>
      </div>
      <CreateWorktreeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        repoPath={repoPath}
      />
    </div>
  );
}
