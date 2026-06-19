import { useEffect, useState } from "react";
import { Search, GitFork, FolderOpen, X, GitBranch, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useWorktrees, useDeleteWorktree } from "@/hooks/use-worktrees";
import type { RepoInfo } from "@/types";

interface SidebarProps {
  repos: RepoInfo[];
  selectedRepo: string | null;
  onSelectRepo: (path: string) => void;
  isLoading: boolean;
  hasRootPath: boolean;
  onSettingsOpen: () => void;
}

export function Sidebar({
  repos,
  selectedRepo,
  onSelectRepo,
  isLoading,
  hasRootPath,
  onSettingsOpen,
}: SidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = repos.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (!hasRootPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <FolderOpen className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No root folder configured.
        </p>
        <Button variant="outline" size="sm" onClick={onSettingsOpen}>
          Open Settings
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search repos..."
            className="pl-8 pr-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-2">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {repos.length === 0
                ? "No repos with worktrees found."
                : "No matching repos."}
            </p>
          ) : (
            filtered.map((repo) => (
              <RepoRow
                key={repo.path}
                repo={repo}
                isSelected={selectedRepo === repo.path}
                onSelect={() => onSelectRepo(repo.path)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function RepoRow({
  repo,
  isSelected,
  onSelect,
}: {
  repo: RepoInfo;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div>
      <button
        onClick={onSelect}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
          isSelected ? "bg-accent text-accent-foreground" : ""
        }`}
      >
        <GitFork className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{repo.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {repo.worktree_count}
        </span>
      </button>

      {isSelected && <WorktreeSubList repoPath={repo.path} />}
    </div>
  );
}

function WorktreeSubList({ repoPath }: { repoPath: string }) {
  const { data: worktrees, isLoading } = useWorktrees(repoPath);
  const deleteMutation = useDeleteWorktree();
  const [confirmName, setConfirmName] = useState<string | null>(null);

  // Auto-cancel confirm state after 3 s
  useEffect(() => {
    if (!confirmName) return;
    const t = setTimeout(() => setConfirmName(null), 3000);
    return () => clearTimeout(t);
  }, [confirmName]);

  if (isLoading) {
    return (
      <div className="ml-5 mt-0.5 space-y-1 pb-1">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-7 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (!worktrees?.length) return null;

  return (
    <div className="ml-5 mt-0.5 space-y-0.5 border-l pb-1 pl-2">
      {worktrees.map((wt) => {
        const isConfirming = confirmName === wt.name;
        const isDeleting =
          deleteMutation.isPending &&
          (deleteMutation.variables as { worktreeName: string })?.worktreeName === wt.name;

        return (
          <div
            key={wt.name}
            className="group flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent"
          >
            <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {wt.branch ?? wt.name}
              {wt.is_main && (
                <span className="ml-1 text-[10px] text-muted-foreground/60">(main)</span>
              )}
            </span>
            {wt.is_dirty && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" title="Dirty" />
            )}

            {!wt.is_main && (
              isConfirming ? (
                <button
                  onClick={() => {
                    setConfirmName(null);
                    deleteMutation.mutate({ repoPath, worktreeName: wt.name });
                  }}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-destructive ring-1 ring-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  Confirm
                </button>
              ) : isDeleting ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
              ) : deleteMutation.isError &&
                (deleteMutation.variables as { worktreeName: string })?.worktreeName === wt.name ? (
                <span title="Delete failed"><AlertCircle className="h-3 w-3 shrink-0 text-destructive" /></span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmName(wt.name);
                  }}
                  className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                  title="Delete worktree"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
