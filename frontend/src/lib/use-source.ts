import { useCallback, useEffect, useRef, useState } from "react";

export type SourceStatus = "idle" | "loading" | "ready" | "failed";

export interface SourceState<T> {
  status: SourceStatus;
  data?: T;
  error?: string;
  fetchedAt?: string;
  reload: () => void;
}

/**
 * Polling source for a JSON endpoint. Statuses: idle before the first fetch,
 * loading while in flight with no data yet, ready once data arrives, failed on
 * fetch/JSON error (last good data is kept so the page can still render it).
 *
 * R7b/c/d page bodies consume this — do not duplicate polling logic in pages.
 */
export function useSource<T>(path: string, intervalMs: number): SourceState<T> {
  const [data, setData] = useState<T>();
  const [status, setStatus] = useState<SourceStatus>("idle");
  const [error, setError] = useState<string>();
  const [fetchedAt, setFetchedAt] = useState<string>();
  const live = useRef(true);

  const load = useCallback(async () => {
    setStatus((previous) => (previous === "idle" ? "loading" : previous));
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as T;
      if (!live.current) return;
      setData(next);
      setStatus("ready");
      setError(undefined);
      setFetchedAt(new Date().toISOString());
    } catch (e) {
      if (!live.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus("failed");
    }
  }, [path]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (intervalMs <= 0) return;
    const timer = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) void load();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [load, intervalMs]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { status, data, error, fetchedAt, reload };
}