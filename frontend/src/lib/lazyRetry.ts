import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "";
  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/i.test(
    message
  );
}

/**
 * Wraps React.lazy with automatic retry logic and recovery from stale chunk errors.
 * If a module fails to download (e.g. during dev server compilation, HMR update, or temporary network drop),
 * it retries up to `retries` times before allowing ErrorBoundary to catch or reloading once.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
  interval = 800
): LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (remaining: number) => {
        factory()
          .then(resolve)
          .catch((error: unknown) => {
            if (isChunkLoadError(error) && remaining > 0) {
              setTimeout(() => {
                attempt(remaining - 1);
              }, interval);
              return;
            }

            // If running in browser and retries exhausted, perform a one-time automatic page reload
            if (isChunkLoadError(error) && typeof window !== "undefined") {
              const storageKey = `retry_chunk_${window.location.pathname}`;
              const hasRetried = sessionStorage.getItem(storageKey);
              if (!hasRetried) {
                sessionStorage.setItem(storageKey, "true");
                window.location.reload();
                return;
              }
            }

            reject(error);
          });
      };

      attempt(retries);
    })
  );
}
