import { Check, Plus, Search, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WorktreeCard } from "./WorktreeCard";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { useWorktrees, useRepairWorktrees } from "@/hooks/use-worktrees";

function getPinnedKey(repoPath: string) {
  return `pinned-worktrees:${repoPath}`;
}

function readPinned(repoPath: string): Set<string> {
  try {
    const raw = localStorage.getItem(getPinnedKey(repoPath));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writePinned(repoPath: string, pinned: Set<string>) {
  localStorage.setItem(getPinnedKey(repoPath), JSON.stringify([...pinned]));
}

interface WorktreeListProps {
  repoPath: string;
}

export function WorktreeList({ repoPath }: WorktreeListProps) {
  const { data: worktrees, isLoading, error } = useWorktrees(repoPath);
  const repairMutation = useRepairWorktrees();
  const [repairMessage, setRepairMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pinned, setPinned] = useState(() => readPinned(repoPath));

  const togglePin = useCallback(
    (name: string) => {
      setPinned((prev) => {
        const next = new Set(prev);
        if (next.has(name)) {
          next.delete(name);
        } else {
          next.add(name);
        }
        writePinned(repoPath, next);
        return next;
      });
    },
    [repoPath],
  );

  useEffect(() => {
    if (!repairMessage) return;
    const timer = setTimeout(() => setRepairMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [repairMessage]);

  const filtered = useMemo(() => {
    if (!worktrees) return [];
    let list = worktrees;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (wt) =>
          wt.name.toLowerCase().includes(q) ||
          wt.branch?.toLowerCase().includes(q) ||
          wt.base_branch?.toLowerCase().includes(q),
      );
    }
    // Sort: pinned first, then original order
    return [...list].sort((a, b) => {
      const ap = pinned.has(a.name) ? 0 : 1;
      const bp = pinned.has(b.name) ? 0 : 1;
      return ap - bp;
    });
  }, [worktrees, search, pinned]);

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
      {worktrees && worktrees.length > 1 && (
        <div className="border-b px-4 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter worktrees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8"
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
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 p-4">
          {filtered.map((wt) => (
            <WorktreeCard
              key={wt.path}
              worktree={wt}
              repoPath={repoPath}
              isPinned={pinned.has(wt.name)}
              onTogglePin={() => togglePin(wt.name)}
            />
          ))}
          {search && filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              No worktrees matching "{search}"
            </p>
          )}
        </div>
      </div>
      <div className="border-t p-3 flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Worktree
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                repairMutation.mutate(repoPath, {
                  onSuccess: (msg) => setRepairMessage({ success: true, text: msg }),
                  onError: (err) =>
                    setRepairMessage({
                      success: false,
                      text: err instanceof Error ? err.message : String(err),
                    }),
                })
              }
              disabled={repairMutation.isPending}
            >
              {repairMessage?.success ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Wrench className={`h-4 w-4 ${repairMutation.isPending ? "animate-spin" : ""}`} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Repair worktrees</TooltipContent>
        </Tooltip>
      </div>
      {repairMessage && (
        <div className={`px-3 pb-2 text-xs ${repairMessage.success ? "text-green-500" : "text-destructive"}`}>
          {repairMessage.text}
        </div>
      )}
      <CreateWorktreeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        repoPath={repoPath}
        onCreated={(name) => {
          setPinned((prev) => {
            const next = new Set(prev);
            next.add(name);
            writePinned(repoPath, next);
            return next;
          });
        }}
      />
    </div>
  );
}
