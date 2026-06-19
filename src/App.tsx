import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainPanel } from "@/components/layout/MainPanel";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useSettings } from "@/hooks/use-settings";
import { useRepos } from "@/hooks/use-repos";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";

function App() {
  const { rootPath, setRootPath, worktreeRoot, setWorktreeRoot, loading: settingsLoading } = useSettings();
  const { data: repos = [], isLoading: reposLoading, isFetching } = useRepos(rootPath);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const queryClient = useQueryClient();

  useRefreshOnFocus();

  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isResizing = useRef(false);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      setSidebarWidth(Math.max(180, Math.min(520, ev.clientX)));
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  const handleSettingsSave = async (path: string, wtRoot: string | null) => {
    await setRootPath(path);
    await setWorktreeRoot(wtRoot);
    setSelectedRepo(null);
  };

  if (settingsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col">
        <Header
          onRefresh={handleRefresh}
          onSettingsOpen={() => setSettingsOpen(true)}
          isRefreshing={isFetching}
        />
        <div className="flex flex-1 overflow-hidden">
          <div style={{ width: sidebarWidth, flexShrink: 0 }} className="overflow-hidden border-r">
            <Sidebar
              repos={repos}
              selectedRepo={selectedRepo}
              onSelectRepo={setSelectedRepo}
              isLoading={reposLoading}
              hasRootPath={!!rootPath}
              onSettingsOpen={() => setSettingsOpen(true)}
            />
          </div>
          <div
            className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40"
            onMouseDown={startResize}
          />
          <div className="flex-1 overflow-hidden">
            <MainPanel selectedRepo={selectedRepo} />
          </div>
        </div>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        rootPath={rootPath}
        worktreeRoot={worktreeRoot}
        onSave={handleSettingsSave}
      />
    </TooltipProvider>
  );
}

export default App;
