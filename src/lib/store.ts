import { load } from "@tauri-apps/plugin-store";

const STORE_PATH = "settings.json";

let storeInstance: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!storeInstance) {
    storeInstance = await load(STORE_PATH, { autoSave: true, defaults: {} });
  }
  return storeInstance;
}

export async function getRootPath(): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>("rootPath")) ?? null;
}

export async function setRootPath(path: string): Promise<void> {
  const store = await getStore();
  await store.set("rootPath", path);
}
