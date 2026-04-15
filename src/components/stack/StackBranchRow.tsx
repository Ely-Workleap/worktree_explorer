import {
  GitBranch,
  Code,
  FolderOpen,
  Terminal,
  ArrowUp,
  ArrowDown,
  Circle,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  Bot,
  Sparkles,
  X,
  Hammer,
  Play,
  Loader2,
} from "lucide-react";
import { useState } from "react";
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
import { PrStatusBadge } from "./PrStatusBadge";
import { openInVscode, openInVisualStudio, openInExplorer, openTerminalTool, buildPr, runPr } from "@/lib/tauri";
import { useExeExists } from "@/hooks/use-build";
import type { StackBranchInfo, PrStatus, BuildConfig } from "@/types";

interface StackBranchRowProps {
  branch: StackBranchInfo;
  isFirst: boolean;
  isLast: boolean;
  prStatus?: PrStatus;
  onRemove: () => void;
  buildConfig?: BuildConfig | null;
}

export function StackBranchRow({ branch, isFirst, isLast, prStatus, onRemove, buildConfig }: StackBranchRowProps) {
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const hasWorktree = !!branch.worktree_path;

  const exePath = buildConfig && branch.worktree_path
    ? `${branch.worktree_path}/${buildConfig.startup_exe}`.replace(/\\/g, "/")
    : null;
  const { data: exeExists } = useExeExists(exePath);

  const handleOpenTool = (tool: "claude" | "codex" | "lazygit") => {
    if (!branch.worktree_path || !branch.worktree_name) return;
    setTerminalMenuOpen(false);
    openTerminalTool(branch.worktree_path, branch.worktree_name, tool);
  };

  return (
    <div className="flex items-stretch">
      {/* Vertical connector */}
      <div className="flex w-6 shrink-0 flex-col items-center">
        <div className={`w-px flex-1 ${isFirst ? "bg-transparent" : "bg-border"}`} />
        <div className="my-0.5 h-2 w-2 shrink-0 rounded-full border-2 border-primary bg-background" />
        <div className={`w-px flex-1 ${isLast ? "bg-transparent" : "bg-border"}`} />
      </div>

      {/* Branch content */}
      <div className="ml-1 flex-1 rounded-md border bg-card p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{branch.branch}</span>
            {prStatus && <PrStatusBadge pr={prStatus} />}
            {!hasWorktree && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                no worktree
              </Badge>
            )}
          </div>
          {hasWorktree && (
            <div className="flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => openInVscode(branch.worktree_path!)}
                  >
                    <Code className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>VS Code</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => openInVisualStudio(branch.worktree_path!)}
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 17L12 7l5 5V4h3v16l-3-1-5-5-10 8z" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Visual Studio</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => openInExplorer(branch.worktree_path!)}
                  >
                    <FolderOpen className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Explorer</TooltipContent>
              </Tooltip>
              <Popover open={terminalMenuOpen} onOpenChange={setTerminalMenuOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <div className="flex items-center">
                          <Terminal className="h-3 w-3" />
                          <ChevronDown className="h-2 w-2" />
                        </div>
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Terminal tools</TooltipContent>
                </Tooltip>
                <PopoverContent className="w-40 p-1">
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent"
                    onClick={() => handleOpenTool("claude")}
                  >
                    <Bot className="h-3 w-3" />
                    Claude
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent"
                    onClick={() => handleOpenTool("codex")}
                  >
                    <Sparkles className="h-3 w-3" />
                    Codex
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent"
                    onClick={() => handleOpenTool("lazygit")}
                  >
                    <GitBranch className="h-3 w-3" />
                    Lazygit
                  </button>
                </PopoverContent>
              </Popover>
              {buildConfig && branch.worktree_path && branch.worktree_name && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                        disabled={building}
                        onClick={async () => {
                          setBuilding(true);
                          try {
                            await buildPr(branch.worktree_path!, branch.worktree_name!, buildConfig.sln_path);
                          } finally {
                            setBuilding(false);
                          }
                        }}
                      >
                        {building ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hammer className="h-3 w-3" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{building ? "Building…" : `Build ${buildConfig.sln_path}`}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                        disabled={!exeExists}
                        onClick={() => runPr(branch.worktree_path!, buildConfig.startup_exe)}
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{exeExists ? `Run ${buildConfig.startup_exe}` : "Build first"}</TooltipContent>
                  </Tooltip>
                </>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={onRemove}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove from stack</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
        {/* Status badges */}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {branch.is_rebasing && (
            <Badge variant="outline" className="gap-1 border-red-500/50 text-red-600 text-[10px]">
              <AlertTriangle className="h-2 w-2" />
              Conflicts — waiting for resolution
            </Badge>
          )}
          {hasWorktree && (
            branch.is_dirty ? (
              <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600 text-[10px]">
                <Circle className="h-1.5 w-1.5 fill-current" />
                Dirty ({branch.file_changes})
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-green-500/50 text-green-600 text-[10px]">
                <CheckCircle className="h-2 w-2" />
                Clean
              </Badge>
            )
          )}
          {branch.ahead > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <ArrowUp className="h-2 w-2" />
              {branch.ahead}
            </Badge>
          )}
          {branch.behind > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <ArrowDown className="h-2 w-2" />
              {branch.behind}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
