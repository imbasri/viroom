// Vitest config — node env by default; jsdom enabled per-file via the
// directive `// @vitest-environment jsdom`. bun:sqlite is aliased to a Node
// shim so the Elysia app under test loads without a Bun runtime.

import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// ponytail: resolve from the repo root at config-load time; upgrade to
// import.meta.url once tsconfig includes "node" types globally.
const here = resolve(process.cwd());
const frontendSrc = resolve(here, "frontend/src");

export default defineConfig({
  resolve: {
    alias: {
      "bun:sqlite": resolve(here, "test/sqlite-shim.ts"),
      "@": frontendSrc,
    },
  },
  test: {
    environment: "node",
    include: [
      "test/**/*.test.ts",
      "test/**/*.test.tsx",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "frontend/test/**/*.test.ts",
      "frontend/test/**/*.test.tsx",
    ],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: [
        "src/**/*.ts",
        "frontend/src/lib/use-source.ts",
        "frontend/src/lib/routes.ts",
        "frontend/src/pages/Kanban.tsx",
        "frontend/src/pages/Memory.tsx",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        // R7f scope ceiling: coverage gate per Nami's decision targets only
        // frontend/src/lib/use-source.ts + routes.ts at 100% lines, plus the
        // R7 page bodies (Kanban, Memory) and backend modules exercised by the
        // /api/kanban test. The frontend files below are R3/R7b/R7e plumbing
        // not covered by R7 tests — excluded so the global gate isn't dragged
        // down by unrelated code (upgrade path: broaden R7 test scope to
        // Agents, Calendar, Office3D, OfficeScene, App, main, store, layout).
        "frontend/src/store.ts",
        "frontend/src/App.tsx",
        "frontend/src/main.tsx",
        "frontend/src/lib/layout.tsx",
        "frontend/src/lib/cron-calendar.ts",
        "frontend/src/pages/Agents.tsx",
        "frontend/src/pages/Calendar.tsx",
        "frontend/src/pages/Office3D.tsx",
        "frontend/src/pages/OfficeScene.tsx",
      ],
      // Keep the bar honest without failing the suite over incidental lines.
      thresholds: {
        lines: 70,
        functions: 60,
        branches: 50,
        // R7f acceptance: zero uncovered lines on the shared R7 shell.
        "frontend/src/lib/use-source.ts": { lines: 100 },
        "frontend/src/lib/routes.ts": { lines: 100 },
      },
    },
  },
});
