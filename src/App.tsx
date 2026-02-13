import { useState } from "react";
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
  const { rootPath, setRootPath, loading: settingsLoading } = useSettings();
  const { data: repos = [], isLoading: reposLoading, isFetching } = useRepos(rootPath);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const queryClient = useQueryClient();

  useRefreshOnFocus();

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  const handleSettingsSave = async (path: string) => {
    await setRootPath(path);
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
        <div className="grid flex-1 grid-cols-[280px_1fr] overflow-hidden">
          <div className="border-r">
            <Sidebar
              repos={repos}
              selectedRepo={selectedRepo}
              onSelectRepo={setSelectedRepo}
              isLoading={reposLoading}
              hasRootPath={!!rootPath}
              onSettingsOpen={() => setSettingsOpen(true)}
            />
          </div>
          <div className="overflow-hidden">
            <MainPanel selectedRepo={selectedRepo} />
          </div>
        </div>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        rootPath={rootPath}
        onSave={handleSettingsSave}
      />
    </TooltipProvider>
  );
}

export default App;
