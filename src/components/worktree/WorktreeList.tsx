import { Check, Plus, Search, Trash2, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorktreeCard } from "./WorktreeCard";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { useWorktrees, useRepairWorktrees, useBatchDeleteWorktrees } from "@/hooks/use-worktrees";
import { useBuildConfig } from "@/hooks/use-build";

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
  const { data: buildConfig } = useBuildConfig(repoPath);
  const repairMutation = useRepairWorktrees();
  const batchDeleteMutation = useBatchDeleteWorktrees();
  const [repairMessage, setRepairMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [batchMessage, setBatchMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [pinned, setPinned] = useState(() => readPinned(repoPath));

  const nonMainWorktrees = useMemo(
    () => worktrees?.filter(wt => !wt.is_main) ?? [],
    [worktrees],
  );

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

  const toggleSelect = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === nonMainWorktrees.length) {
        return new Set();
      }
      return new Set(nonMainWorktrees.map(wt => wt.name));
    });
  }, [nonMainWorktrees]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  useEffect(() => {
    if (!repairMessage) return;
    const timer = setTimeout(() => setRepairMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [repairMessage]);

  useEffect(() => {
    if (!batchMessage) return;
    const timer = setTimeout(() => setBatchMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [batchMessage]);

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

  const allSelected = nonMainWorktrees.length > 0 && selected.size === nonMainWorktrees.length;

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

      {selectMode && (
        <div className="border-b px-4 py-2 flex items-center gap-2 bg-muted/50">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground"
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${allSelected ? "bg-primary border-primary" : "border-muted-foreground"}`}>
              {allSelected && <Check className="h-3 w-3 text-primary-foreground" />}
            </span>
            Select all
          </button>
          <span className="text-xs text-muted-foreground ml-auto">
            {selected.size} selected
          </span>
          <Button variant="ghost" size="sm" onClick={exitSelectMode}>
            Cancel
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 p-4">
          {filtered.map((wt) => (
            <div key={wt.path} className="flex items-start gap-2">
              {selectMode && !wt.is_main && (
                <button
                  onClick={() => toggleSelect(wt.name)}
                  className="mt-3 flex-shrink-0"
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected.has(wt.name) ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                    {selected.has(wt.name) && <Check className="h-3 w-3 text-primary-foreground" />}
                  </span>
                </button>
              )}
              {selectMode && wt.is_main && (
                <span className="mt-3 flex-shrink-0 w-4" />
              )}
              <div className="flex-1 min-w-0">
                <WorktreeCard
                  worktree={wt}
                  repoPath={repoPath}
                  isPinned={pinned.has(wt.name)}
                  onTogglePin={() => togglePin(wt.name)}
                  buildConfig={buildConfig}
                />
              </div>
            </div>
          ))}
          {search && filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              No worktrees matching "{search}"
            </p>
          )}
        </div>
      </div>

      {selectMode ? (
        <div className="border-t p-3 flex gap-2">
          <Button
            variant="destructive"
            className="flex-1"
            disabled={selected.size === 0 || batchDeleteMutation.isPending}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {batchDeleteMutation.isPending
              ? "Deleting..."
              : `Delete ${selected.size} worktree(s)`}
          </Button>
        </div>
      ) : (
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
                onClick={() => {
                  setSelectMode(true);
                  setSelected(new Set());
                }}
                disabled={nonMainWorktrees.length === 0}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Batch delete worktrees</TooltipContent>
          </Tooltip>
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
      )}

      {repairMessage && (
        <div className={`px-3 pb-2 text-xs ${repairMessage.success ? "text-green-500" : "text-destructive"}`}>
          {repairMessage.text}
        </div>
      )}
      {batchMessage && (
        <div className={`px-3 pb-2 text-xs ${batchMessage.success ? "text-green-500" : "text-destructive"}`}>
          {batchMessage.text}
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

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Worktrees</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{selected.size}</strong> worktree(s)?
              {allSelected && " The main worktree will be checked out to the default branch (main/master)."}
              {" "}This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-40 overflow-y-auto text-sm space-y-1 px-1">
            {[...selected].map(name => {
              const wt = worktrees?.find(w => w.name === name);
              return (
                <div key={name} className="flex items-center gap-2 text-muted-foreground">
                  <Trash2 className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{wt?.branch ?? name}</span>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={batchDeleteMutation.isPending}
              onClick={() =>
                batchDeleteMutation.mutate(
                  {
                    repoPath,
                    worktreeNames: [...selected],
                    checkoutMain: allSelected,
                  },
                  {
                    onSuccess: (msg) => {
                      setConfirmDeleteOpen(false);
                      exitSelectMode();
                      setBatchMessage({ success: true, text: msg });
                    },
                    onError: (err) => {
                      setConfirmDeleteOpen(false);
                      setBatchMessage({
                        success: false,
                        text: err instanceof Error ? err.message : String(err),
                      });
                    },
                  },
                )
              }
            >
              {batchDeleteMutation.isPending ? "Deleting..." : `Delete ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
