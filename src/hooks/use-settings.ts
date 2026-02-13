import { useState, useEffect, useCallback } from "react";
import { getRootPath, setRootPath as saveRootPath } from "@/lib/store";

export function useSettings() {
  const [rootPath, setRootPathState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRootPath().then((path) => {
      setRootPathState(path);
      setLoading(false);
    });
  }, []);

  const setRootPath = useCallback(async (path: string) => {
    await saveRootPath(path);
    setRootPathState(path);
  }, []);

  return { rootPath, setRootPath, loading };
}
