import { useState } from "react";
import { Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StackCard } from "./StackCard";
import { CreateStackDialog } from "./CreateStackDialog";
import { useStacks } from "@/hooks/use-stacks";

interface StackListProps {
  repoPath: string;
}

export function StackList({ repoPath }: StackListProps) {
  const { data: stacks, isLoading, error } = useStacks(repoPath);
  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-destructive">
          Failed to load stacks: {(error as Error).message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {stacks && stacks.length > 0 ? (
          <div className="space-y-3 p-4">
            {stacks.map((stack) => (
              <StackCard key={stack.name} stack={stack} repoPath={repoPath} />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center p-4">
            <Layers className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No stacks yet. Create one to manage dependent branches.
            </p>
          </div>
        )}
      </div>
      <div className="border-t p-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Stack
        </Button>
      </div>
      <CreateStackDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        repoPath={repoPath}
      />
    </div>
  );
}
