import { useState } from "react";
import { GitFork, GitBranch, Layers } from "lucide-react";
import { WorktreeList } from "@/components/worktree/WorktreeList";
import { StackList } from "@/components/stack/StackList";

interface MainPanelProps {
  selectedRepo: string | null;
}

type Tab = "worktrees" | "stacks";

export function MainPanel({ selectedRepo }: MainPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("worktrees");

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

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab("worktrees")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "worktrees"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Worktrees
        </button>
        <button
          onClick={() => setActiveTab("stacks")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "stacks"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Stacks
        </button>
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1">
        {activeTab === "worktrees" ? (
          <WorktreeList repoPath={selectedRepo} />
        ) : (
          <StackList repoPath={selectedRepo} />
        )}
      </div>
    </div>
  );
}
