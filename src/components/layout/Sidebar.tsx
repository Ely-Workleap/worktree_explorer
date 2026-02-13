import { useState } from "react";
import { Search, GitFork, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
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
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-2">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-md bg-muted"
                />
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
              <button
                key={repo.path}
                onClick={() => onSelectRepo(repo.path)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                  selectedRepo === repo.path
                    ? "bg-accent text-accent-foreground"
                    : ""
                }`}
              >
                <GitFork className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{repo.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {repo.worktree_count}
                </span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
