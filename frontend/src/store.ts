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
