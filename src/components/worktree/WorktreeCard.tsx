import { useState } from "react";
import {
  GitBranch,
  GitMerge,
  Code,
  FolderOpen,
  Terminal,
  Trash2,
  Lock,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Circle,
  CheckCircle,
  Loader2,
  ChevronDown,
  IterationCcw,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BranchCombobox } from "./BranchCombobox";
import { DeleteWorktreeDialog } from "./DeleteWorktreeDialog";
import { openInVscode, openInVisualStudio, openInExplorer, openInTerminal } from "@/lib/tauri";
import { useMergeBase, useRebaseOntoMaster, useSetBaseBranch } from "@/hooks/use-worktrees";
import { useBranches } from "@/hooks/use-branches";
import type { WorktreeInfo } from "@/types";

interface WorktreeCardProps {
  worktree: WorktreeInfo;
  repoPath: string;
}

export function WorktreeCard({ worktree, repoPath }: WorktreeCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gitMenuOpen, setGitMenuOpen] = useState(false);
  const [baseBranchPickerOpen, setBaseBranchPickerOpen] = useState(false);
  const [selectedBase, setSelectedBase] = useState("");
  const [resultMessage, setResultMessage] = useState<{
    success: boolean;
    text: string;
  } | null>(null);
  const mergeMutation = useMergeBase();
  const rebaseMutation = useRebaseOntoMaster();
  const setBaseMutation = useSetBaseBranch();
  const { data: branches } = useBranches(baseBranchPickerOpen ? repoPath : null);

  const localBranches = branches?.filter((b) => !b.is_remote) ?? [];
  const branchDisplay = worktree.branch ?? "(detached)";
  const isGitBusy = mergeMutation.isPending || rebaseMutation.isPending;

  const handleGitResult = (result: { success: boolean; message: string }) => {
    setResultMessage({ success: result.success, text: result.message });
  };

  const handleGitError = (error: unknown) => {
    setResultMessage({
      success: false,
      text: (error as Error).message,
    });
  };

  const handleMerge = () => {
    if (!worktree.base_branch) return;
    setResultMessage(null);
    setGitMenuOpen(false);
    mergeMutation.mutate(
      {
        repoPath,
        worktreePath: worktree.path,
        baseBranch: worktree.base_branch,
      },
      { onSuccess: handleGitResult, onError: handleGitError },
    );
  };

  const handleRebase = () => {
    if (!worktree.base_branch) return;
    setResultMessage(null);
    setGitMenuOpen(false);
    rebaseMutation.mutate(
      {
        repoPath,
        worktreePath: worktree.path,
        baseBranch: worktree.base_branch,
      },
      { onSuccess: handleGitResult, onError: handleGitError },
    );
  };

  const handleSetBaseBranch = (branchName: string) => {
    if (!branchName) return;
    setBaseMutation.mutate(
      {
        repoPath,
        worktreeName: worktree.name,
        baseBranch: branchName,
      },
      {
        onSuccess: () => {
          setBaseBranchPickerOpen(false);
          setSelectedBase("");
        },
      },
    );
  };

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{branchDisplay}</span>
            {worktree.base_branch ? (
              <Popover open={baseBranchPickerOpen} onOpenChange={setBaseBranchPickerOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-3 w-3" />
                    {worktree.base_branch}
                    <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3">
                  <p className="mb-2 text-xs font-medium">Change base branch</p>
                  <BranchCombobox
                    branches={localBranches}
                    value={selectedBase}
                    onValueChange={(v) => {
                      setSelectedBase(v);
                      if (v) handleSetBaseBranch(v);
                    }}
                    placeholder={worktree.base_branch}
                  />
                </PopoverContent>
              </Popover>
            ) : !worktree.is_main ? (
              <Popover open={baseBranchPickerOpen} onOpenChange={setBaseBranchPickerOpen}>
                <PopoverTrigger asChild>
                  <button className="text-xs text-muted-foreground underline decoration-dashed hover:text-foreground">
                    Set base branch
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3">
                  <p className="mb-2 text-xs font-medium">Select base branch</p>
                  <BranchCombobox
                    branches={localBranches}
                    value={selectedBase}
                    onValueChange={(v) => {
                      setSelectedBase(v);
                      if (v) handleSetBaseBranch(v);
                    }}
                    placeholder="Choose a branch..."
                  />
                </PopoverContent>
              </Popover>
            ) : null}
            {worktree.is_main && (
              <Badge variant="secondary" className="text-[10px]">
                main
              </Badge>
            )}
            {worktree.is_locked && (
              <Lock className="h-3 w-3 text-amber-500" />
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {worktree.is_dirty ? (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/50 text-amber-600"
              >
                <Circle className="h-2 w-2 fill-current" />
                Dirty ({worktree.file_changes})
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-green-500/50 text-green-600"
              >
                <CheckCircle className="h-2.5 w-2.5" />
                Clean
              </Badge>
            )}
            {worktree.ahead > 0 && (
              <Badge variant="outline" className="gap-1">
                <ArrowUp className="h-2.5 w-2.5" />
                {worktree.ahead}
              </Badge>
            )}
            {worktree.behind > 0 && (
              <Badge variant="outline" className="gap-1">
                <ArrowDown className="h-2.5 w-2.5" />
                {worktree.behind}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {worktree.path}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {worktree.base_branch && (
            <Popover open={gitMenuOpen} onOpenChange={setGitMenuOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isGitBusy}
                    >
                      {isGitBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <div className="flex items-center">
                          <GitMerge className="h-3.5 w-3.5" />
                          <ChevronDown className="h-2.5 w-2.5" />
                        </div>
                      )}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Git operations</TooltipContent>
              </Tooltip>
              <PopoverContent className="w-56 p-1">
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={handleMerge}
                >
                  <GitMerge className="h-4 w-4" />
                  Merge {worktree.base_branch}
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={handleRebase}
                >
                  <IterationCcw className="h-4 w-4" />
                  Rebase onto master
                </button>
              </PopoverContent>
            </Popover>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openInVscode(worktree.path)}
              >
                <Code className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in VS Code</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openInVisualStudio(worktree.path)}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 17L12 7l5 5V4h3v16l-3-1-5-5-10 8z" />
                </svg>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in Visual Studio</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openInExplorer(worktree.path)}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in Explorer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openInTerminal(worktree.path)}
              >
                <Terminal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in Terminal</TooltipContent>
          </Tooltip>
          {!worktree.is_main && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Worktree</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {resultMessage && (
        <p
          className={`mt-2 text-xs ${resultMessage.success ? "text-green-600" : "text-destructive"}`}
        >
          {resultMessage.text}
        </p>
      )}
      <DeleteWorktreeDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        repoPath={repoPath}
        worktree={worktree}
      />
    </div>
  );
}
