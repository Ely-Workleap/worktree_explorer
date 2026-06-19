import { useState, useEffect, useCallback } from "react";
import {
  getRootPath,
  setRootPath as saveRootPath,
  getWorktreeRoot,
  setWorktreeRoot as saveWorktreeRoot,
} from "@/lib/store";

export function useSettings() {
  const [rootPath, setRootPathState] = useState<string | null>(null);
  const [worktreeRoot, setWorktreeRootState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getRootPath(), getWorktreeRoot()]).then(([path, wtRoot]) => {
      setRootPathState(path);
      setWorktreeRootState(wtRoot);
      setLoading(false);
    });
  }, []);

  const setRootPath = useCallback(async (path: string) => {
    await saveRootPath(path);
    setRootPathState(path);
  }, []);

  const setWorktreeRoot = useCallback(async (path: string | null) => {
    await saveWorktreeRoot(path);
    setWorktreeRootState(path);
  }, []);

  return { rootPath, setRootPath, worktreeRoot, setWorktreeRoot, loading };
}
