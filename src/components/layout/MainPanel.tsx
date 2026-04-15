import { useState } from "react";
import {
  GitFork,
  GitBranch,
  Layers,
  GitPullRequest,
  Settings,
  ChevronDown,
  ChevronUp,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { WorktreeList } from "@/components/worktree/WorktreeList";
import { StackList } from "@/components/stack/StackList";
import { PrReviewPanel } from "@/components/pr-review/PrReviewPanel";
import { useBuildConfig, useSetBuildConfig } from "@/hooks/use-build";
import type { BuildConfig } from "@/types";

interface MainPanelProps {
  selectedRepo: string | null;
}

type Tab = "worktrees" | "stacks" | "pr-review";

export function MainPanel({ selectedRepo }: MainPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("worktrees");
  const [configOpen, setConfigOpen] = useState(false);
  const { data: buildConfig } = useBuildConfig(selectedRepo);

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
        <button
          onClick={() => setActiveTab("pr-review")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "pr-review"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <GitPullRequest className="h-3.5 w-3.5" />
          PR Review
        </button>

        {/* Build config toggle — right-aligned */}
        <button
          onClick={() => setConfigOpen((o) => !o)}
          title="Build config"
          className={`ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            buildConfig
              ? "text-primary hover:text-primary/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          Build
          {configOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Build config panel (collapsible) */}
      {configOpen && (
        <BuildConfigPanel repoPath={selectedRepo} current={buildConfig ?? null} />
      )}

      {/* Tab content */}
      <div className="min-h-0 flex-1">
        {activeTab === "worktrees" ? (
          <WorktreeList repoPath={selectedRepo} />
        ) : activeTab === "stacks" ? (
          <StackList repoPath={selectedRepo} />
        ) : (
          <PrReviewPanel repoPath={selectedRepo} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build config editor (shared across all tabs)
// ---------------------------------------------------------------------------

function toRelativePath(repoPath: string, absolutePath: string): string {
  const normalize = (p: string) => p.replace(/\\/g, "/");
  const norm = normalize(absolutePath);
  const repoNorm = normalize(repoPath);

  if (norm.startsWith(repoNorm + "/")) {
    return norm.slice(repoNorm.length + 1);
  }

  const repoParent = repoNorm.substring(0, repoNorm.lastIndexOf("/"));
  if (norm.startsWith(repoParent + "/")) {
    const afterParent = norm.slice(repoParent.length + 1);
    const slashIdx = afterParent.indexOf("/");
    if (slashIdx !== -1) {
      return afterParent.slice(slashIdx + 1);
    }
  }

  return norm;
}

function BuildConfigPanel({
  repoPath,
  current,
}: {
  repoPath: string;
  current: BuildConfig | null;
}) {
  const [sln, setSln] = useState(current?.sln_path ?? "");
  const [exe, setExe] = useState(current?.startup_exe ?? "");
  const [saved, setSaved] = useState(false);
  const setConfigMutation = useSetBuildConfig();

  const browseSln = async () => {
    const result = await openDialog({
      title: "Select .sln file",
      filters: [{ name: "Solution", extensions: ["sln", "slnx", "slnf"] }],
      defaultPath: repoPath,
    });
    if (typeof result === "string") {
      setSln(toRelativePath(repoPath, result));
    }
  };

  const browseExe = async () => {
    const result = await openDialog({
      title: "Select startup executable",
      filters: [{ name: "Executable", extensions: ["exe"] }],
      defaultPath: repoPath,
    });
    if (typeof result === "string") {
      setExe(toRelativePath(repoPath, result));
    }
  };

  const handleSave = () => {
    const config =
      sln.trim() && exe.trim()
        ? { sln_path: sln.trim(), startup_exe: exe.trim() }
        : null;
    setConfigMutation.mutate(
      { repoPath, config },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2 border-b bg-muted/30 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">
        Build config — paths relative to each worktree root
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 text-muted-foreground">.sln file</span>
          <input
            value={sln}
            onChange={(e) => setSln(e.target.value)}
            placeholder="e.g. Sharegate.sln"
            className="h-7 flex-1 rounded border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={browseSln}
            title="Browse for .sln file"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 text-muted-foreground">Startup exe</span>
          <input
            value={exe}
            onChange={(e) => setExe(e.target.value)}
            placeholder="e.g. src/App/bin/Debug/App.exe"
            className="h-7 flex-1 rounded border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={browseExe}
            title="Browse for executable"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={setConfigMutation.isPending}
          className="flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {setConfigMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            "Save"
          )}
        </button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
        {current && (
          <button
            onClick={() => setConfigMutation.mutate({ repoPath, config: null })}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
