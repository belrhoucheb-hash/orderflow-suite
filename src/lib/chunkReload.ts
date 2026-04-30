const CHUNK_RELOAD_KEY = "orderflow:last-chunk-reload-at";
const RELOAD_THROTTLE_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /loading chunk \d+ failed/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /vite:preloadError/i.test(message)
  );
}

export function reloadForFreshBuild(): boolean {
  if (typeof window === "undefined") return false;

  const now = Date.now();
  const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
  if (Number.isFinite(lastReloadAt) && now - lastReloadAt < RELOAD_THROTTLE_MS) {
    return false;
  }

  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  window.location.reload();
  return true;
}
