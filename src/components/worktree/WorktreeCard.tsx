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
  Bot,
  Sparkles,
  Scissors,
  AlertTriangle,
  SkipForward,
  XCircle,
  Play,
  Pin,
  Hammer,
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
import { openInVscode, openInVisualStudio, openInExplorer, openTerminalTool, openClaudeSplit, buildPr, runPr } from "@/lib/tauri";
import { useMergeBase, useRebaseOntoMaster, useSetBaseBranch, useRebaseAction } from "@/hooks/use-worktrees";
import { useExeExists } from "@/hooks/use-build";
import { useBranches } from "@/hooks/use-branches";
import type { WorktreeInfo, MergeResult, BuildConfig } from "@/types";

function formatRelativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

interface WorktreeCardProps {
  worktree: WorktreeInfo;
  repoPath: string;
  isPinned: boolean;
  onTogglePin: () => void;
  buildConfig?: BuildConfig | null;
}

export function WorktreeCard({ worktree, repoPath, isPinned, onTogglePin, buildConfig }: WorktreeCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gitMenuOpen, setGitMenuOpen] = useState(false);
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const [baseBranchPickerOpen, setBaseBranchPickerOpen] = useState(false);
  const [selectedBase, setSelectedBase] = useState("");
  const [resultMessage, setResultMessage] = useState<{
    success: boolean;
    hasConflicts: boolean;
    text: string;
  } | null>(null);
  const mergeMutation = useMergeBase();
  const rebaseMutation = useRebaseOntoMaster();
  const setBaseMutation = useSetBaseBranch();
  const rebaseActionMutation = useRebaseAction();
  const { data: branches } = useBranches(baseBranchPickerOpen ? repoPath : null);

  const [building, setBuilding] = useState(false);

  const exePath = buildConfig
    ? `${worktree.path}/${buildConfig.startup_exe}`.replace(/\\/g, "/")
    : null;
  const { data: exeExists } = useExeExists(exePath);

  const localBranches = branches?.filter((b) => !b.is_remote) ?? [];
  const branchDisplay = worktree.branch ?? "(detached)";
  const isGitBusy = mergeMutation.isPending || rebaseMutation.isPending || rebaseActionMutation.isPending;
  const showRebaseActions = worktree.is_rebasing || resultMessage?.hasConflicts;

  const handleGitResult = (result: MergeResult) => {
    setResultMessage({ success: result.success, hasConflicts: result.has_conflicts, text: result.message });
  };

  const handleGitError = (error: unknown) => {
    setResultMessage({
      success: false,
      hasConflicts: false,
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

  const handleRebaseAction = (action: "continue" | "skip" | "abort") => {
    setResultMessage(null);
    rebaseActionMutation.mutate(
      { repoPath, worktreePath: worktree.path, action },
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

  const handleOpenTool = (tool: "claude" | "codex" | "lazygit") => {
    setTerminalMenuOpen(false);
    openTerminalTool(worktree.path, worktree.name, tool);
  };

  return (
    <div className={`rounded-lg border p-3 shadow-sm ${isPinned ? "border-primary/30 bg-primary/5" : "bg-card"}`}>
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
            {worktree.stack_name && (
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                {worktree.stack_name}
              </Badge>
            )}
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
            {worktree.is_rebasing && (
              <Badge
                variant="outline"
                className="gap-1 border-red-500/50 text-red-600"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                Rebase in progress
              </Badge>
            )}
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
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <p className="truncate">{worktree.path}</p>
            {worktree.created_at && (
              <span className="shrink-0">{formatRelativeTime(worktree.created_at)}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onTogglePin}
              >
                <Pin className={`h-4 w-4 ${isPinned ? "fill-current text-foreground" : "text-muted-foreground"}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPinned ? "Unpin" : "Pin to top"}</TooltipContent>
          </Tooltip>
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
          <Popover open={terminalMenuOpen} onOpenChange={setTerminalMenuOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <div className="flex items-center">
                      <Terminal className="h-3.5 w-3.5" />
                      <ChevronDown className="h-2.5 w-2.5" />
                    </div>
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Terminal tools</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-48 p-1">
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleOpenTool("claude")}
              >
                <Bot className="h-4 w-4" />
                Claude
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleOpenTool("codex")}
              >
                <Sparkles className="h-4 w-4" />
                Codex
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleOpenTool("lazygit")}
              >
                <GitBranch className="h-4 w-4" />
                Lazygit
              </button>
              {!worktree.is_main && (
                <>
                  <div className="my-1 border-t" />
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      setTerminalMenuOpen(false);
                      openClaudeSplit(worktree.path, worktree.name, repoPath, worktree.branch ?? worktree.name);
                    }}
                  >
                    <Scissors className="h-4 w-4" />
                    Split with Claude
                  </button>
                </>
              )}
            </PopoverContent>
          </Popover>
          {buildConfig && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                    disabled={building}
                    onClick={async () => {
                      setBuilding(true);
                      try {
                        await buildPr(worktree.path, worktree.name, buildConfig.sln_path);
                      } finally {
                        setBuilding(false);
                      }
                    }}
                  >
                    {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{building ? "Building…" : `Build ${buildConfig.sln_path}`}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                    disabled={!exeExists}
                    onClick={() => runPr(worktree.path, buildConfig.startup_exe)}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{exeExists ? `Run ${buildConfig.startup_exe}` : "Build first"}</TooltipContent>
              </Tooltip>
            </>
          )}
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
      {showRebaseActions && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rebase:</span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            disabled={isGitBusy}
            onClick={() => handleRebaseAction("continue")}
          >
            <Play className="h-3 w-3" />
            Continue
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            disabled={isGitBusy}
            onClick={() => handleRebaseAction("skip")}
          >
            <SkipForward className="h-3 w-3" />
            Skip
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-destructive hover:text-destructive"
            disabled={isGitBusy}
            onClick={() => handleRebaseAction("abort")}
          >
            <XCircle className="h-3 w-3" />
            Abort
          </Button>
        </div>
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
