import { useState } from "react";
import {
  GitPullRequest,
  ExternalLink,
  Loader2,
  MessageSquare,
  Trash2,
  Hammer,
  RefreshCw,
  Code2,
  MonitorDot,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { usePrWorktrees, useCheckoutPrWorktree } from "@/hooks/use-github";
import { useDeleteWorktree } from "@/hooks/use-worktrees";
import { useBuildConfig, useExeExists } from "@/hooks/use-build";
import { openClaudePrReview, buildPr, runPr, pullPrWorktree, openInVscode, openInVisualStudio } from "@/lib/tauri";
import { useQueryClient } from "@tanstack/react-query";
import type { PrWorktreeInfo, BuildConfig } from "@/types";

interface PrReviewPanelProps {
  repoPath: string | null;
}

export function PrReviewPanel({ repoPath }: PrReviewPanelProps) {
  const [prInput, setPrInput] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const { data: prWorktrees, isLoading } = usePrWorktrees(repoPath);
  const { data: buildConfig } = useBuildConfig(repoPath);
  const checkoutMutation = useCheckoutPrWorktree();

  const handleCheckout = () => {
    if (!repoPath) return;
    const num = parseInt(prInput.trim(), 10);
    if (isNaN(num) || num <= 0) {
      setCheckoutError("Enter a valid PR number");
      return;
    }
    setCheckoutError(null);
    checkoutMutation.mutate(
      { repoPath, prNumber: num },
      {
        onSuccess: () => setPrInput(""),
        onError: (err) => setCheckoutError((err as Error).message),
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleCheckout();
  };

  if (!repoPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <GitPullRequest className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Select a repository to review PRs.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Checkout input row */}
      <div className="flex flex-col gap-1.5 border-b p-3">
        <div className="flex gap-2">
          <input
            type="number"
            value={prInput}
            onChange={(e) => setPrInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="PR number…"
            min={1}
            className="h-8 w-36 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            onClick={handleCheckout}
            disabled={checkoutMutation.isPending || !prInput.trim()}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {checkoutMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitPullRequest className="h-3.5 w-3.5" />
            )}
            Checkout PR
          </button>
        </div>
        {checkoutError && (
          <p className="text-xs text-destructive">{checkoutError}</p>
        )}
      </div>

      {/* Card list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !prWorktrees || prWorktrees.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
            <GitPullRequest className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No PR worktrees yet. Enter a PR number above to check one out locally.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {prWorktrees.map((pr) => (
              <PrWorktreeCard
                key={pr.pr_number}
                pr={pr}
                repoPath={repoPath}
                buildConfig={buildConfig ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PR worktree card
// ---------------------------------------------------------------------------

function PrWorktreeCard({
  pr,
  repoPath,
  buildConfig,
}: {
  pr: PrWorktreeInfo;
  repoPath: string;
  buildConfig: BuildConfig | null;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullSuccess, setPullSuccess] = useState(false);
  const [needsRebuild, setNeedsRebuild] = useState(false);
  const [building, setBuilding] = useState(false);
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteWorktree();

  const exePath = buildConfig
    ? `${pr.worktree_path}/${buildConfig.startup_exe}`.replace(/\\/g, "/")
    : null;
  const { data: exeExists } = useExeExists(exePath);

  const handleOpenUrl = () => {
    if (pr.url) open(pr.url);
  };

  const handleAskClaude = async () => {
    setOpenError(null);
    try {
      await openClaudePrReview(
        pr.worktree_path,
        pr.worktree_name,
        pr.pr_number,
        pr.title,
        pr.url,
        pr.head_branch,
        pr.base_branch,
      );
    } catch (err) {
      setOpenError((err as Error).message);
    }
  };

  const handleBuild = async () => {
    if (!buildConfig || building) return;
    setBuilding(true);
    setBuildError(null);
    try {
      await buildPr(pr.worktree_path, pr.worktree_name, buildConfig.sln_path);
      setNeedsRebuild(false);
      queryClient.invalidateQueries({ queryKey: ["exe-exists", exePath] });
    } catch (err) {
      setBuildError((err as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  const handleRun = async () => {
    if (!buildConfig) return;
    setRunError(null);
    try {
      await runPr(pr.worktree_path, buildConfig.startup_exe);
    } catch (err) {
      setRunError((err as Error).message);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    setPullError(null);
    setPullSuccess(false);
    try {
      await pullPrWorktree(repoPath, pr.worktree_path, pr.pr_number);
      queryClient.invalidateQueries({ queryKey: ["pr-worktrees", repoPath] });
      setNeedsRebuild(true);
      setPullSuccess(true);
      setTimeout(() => setPullSuccess(false), 3000);
    } catch (err) {
      setPullError((err as Error).message);
    } finally {
      setPulling(false);
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate(
      { repoPath, worktreeName: pr.worktree_name },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["pr-worktrees", repoPath] });
          setConfirmDelete(false);
        },
      },
    );
  };

  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">#{pr.pr_number}</span>
            {pr.url ? (
              <button
                onClick={handleOpenUrl}
                className="flex items-center gap-1 truncate text-sm font-medium hover:underline"
                title={pr.title || pr.head_branch}
              >
                <span className="truncate">{pr.title || pr.head_branch}</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            ) : (
              <span className="truncate text-sm font-medium">{pr.title || pr.head_branch}</span>
            )}
          </div>
          {/* Branch badges + sync status */}
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
              {pr.head_branch || `pr/${pr.pr_number}`}
            </span>
            {pr.base_branch && (
              <>
                <span>→</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{pr.base_branch}</span>
              </>
            )}
            {pr.is_up_to_date === true && (
              <span className="ml-1 flex items-center gap-0.5 rounded-full bg-green-500/10 px-1.5 py-0.5 text-green-700 dark:text-green-400" title="Local branch matches remote PR head">
                <CheckCircle2 className="h-3 w-3" />
                Up to date
              </span>
            )}
            {pr.is_up_to_date === false && (
              <span className="ml-1 flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400" title="Remote PR has newer commits — click Pull to update">
                <AlertCircle className="h-3 w-3" />
                Behind remote
              </span>
            )}
          </div>
          {/* Worktree path */}
          <p className="truncate text-xs text-muted-foreground" title={pr.worktree_path}>
            {pr.worktree_path}
          </p>
        </div>
      </div>

      {/* Action row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => openInVscode(pr.worktree_path)}
          title="Open in VS Code"
          className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Code2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => openInVisualStudio(pr.worktree_path)}
          title="Open in Visual Studio"
          className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MonitorDot className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handlePull}
          disabled={pulling}
          className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
            pullSuccess
              ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-blue-500/50 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 dark:text-blue-400"
          } disabled:pointer-events-none disabled:opacity-50`}
          title="Pull latest changes from GitHub"
        >
          <RefreshCw className={`h-3 w-3 ${pulling ? "animate-spin" : ""}`} />
          {pullSuccess ? "Updated" : "Pull"}
        </button>
        <button
          onClick={handleAskClaude}
          className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <MessageSquare className="h-3 w-3" />
          Ask Claude
        </button>

        {buildConfig && (
          <>
            <button
              onClick={handleBuild}
              disabled={building}
              className="flex h-7 items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 disabled:pointer-events-none disabled:opacity-50 dark:text-amber-400"
              title={building ? "Build in progress…" : `Build ${buildConfig.sln_path}`}
            >
              {building ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hammer className="h-3 w-3" />}
              {building ? "Building…" : "Build"}
            </button>
            <button
              onClick={handleRun}
              disabled={!exeExists || needsRebuild}
              className="flex h-7 items-center gap-1.5 rounded-md border border-green-500/50 bg-green-500/10 px-2.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-500/20 disabled:pointer-events-none disabled:opacity-40 dark:text-green-400"
              title={needsRebuild ? "Rebuild required after pull" : exeExists ? `Launch ${buildConfig.startup_exe}` : "Build first to enable Run"}
            >
              ▶ Run
            </button>
          </>
        )}

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleteMutation.isPending}
            className="flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-destructive">Remove worktree?</span>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="flex h-7 items-center gap-1 rounded-md bg-destructive px-2 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
            >
              No
            </button>
          </div>
        )}
      </div>

      {openError && <p className="mt-1.5 text-xs text-destructive">{openError}</p>}
      {buildError && <p className="mt-1.5 text-xs text-destructive">{buildError}</p>}
      {runError && <p className="mt-1.5 text-xs text-destructive">{runError}</p>}
      {pullError && <p className="mt-1.5 text-xs text-destructive">{pullError}</p>}
    </div>
  );
}
