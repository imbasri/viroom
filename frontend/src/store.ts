/**
 * Store shell (R1/R3): health + R3 cron jobs polling.
 * R7 pages consume useSource from ./lib/use-source; this module keeps the
 * existing R3 API intact for Calendar.tsx.
 */
import { create } from "zustand";

interface HealthState {
  status: "idle" | "ok" | "error";
  checkHealth: () => Promise<void>;
}

export const useHealthStore = create<HealthState>((set) => ({
  status: "idle",
  checkHealth: async () => {
    try {
      const res = await fetch("/api/health");
      const data = (await res.json()) as { ok: boolean };
      set({ status: data.ok ? "ok" : "error" });
    } catch {
      set({ status: "error" });
    }
  },
}));

/** Shapes Calendar.tsx already depends on. */
interface CronState {
  status: "idle" | "loading" | "ok" | "error" | "unavailable";
  jobs: CronJob[];
  failedProfiles: string[];
  error: string;
  fetchedAt: string | undefined;
  fetchCron: () => Promise<void>;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  repeat?: string;
  nextRun?: string;
  lastRun?: string;
  lastRunOk?: boolean;
  overdue?: boolean;
  status?: string;
  agent?: string;
}

const fetchCron = async (): Promise<{
  status: CronState["status"];
  jobs: CronJob[];
  failedProfiles: string[];
  error: string;
  fetchedAt: string | undefined;
}> => {
  const res = await fetch("/api/cron");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as {
    status?: CronState["status"];
    data?: { jobs: CronJob[]; failedProfiles?: string[]; fetchedAt?: string };
    error?: string;
  };
  return {
    status: body.status ?? "ok",
    jobs: (body.data?.jobs ?? []) as CronJob[],
    failedProfiles: (body.data?.failedProfiles ?? []) as string[],
    error: body.error ?? "",
    fetchedAt: body.data?.fetchedAt,
  };
};

export const useCronStore = create<CronState>((set) => ({
  status: "idle",
  jobs: [],
  failedProfiles: [],
  error: "",
  fetchedAt: undefined,
  fetchCron: async () => {
    set({ status: "loading" });
    try {
      const r = await fetchCron();
      set({
        status: r.status,
        jobs: r.jobs,
        failedProfiles: r.failedProfiles,
        error: r.error,
        fetchedAt: r.fetchedAt,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({
        status: "error",
        jobs: [],
        failedProfiles: [],
        error: msg,
        fetchedAt: undefined,
      });
    }
  },
}));
