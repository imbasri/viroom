// Vitest config — node env by default; jsdom enabled per-file via the
// directive `// @vitest-environment jsdom`. bun:sqlite is aliased to a Node
// shim so the Elysia app under test loads without a Bun runtime.

import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// ponytail: resolve from the repo root at config-load time; upgrade to
// import.meta.url once tsconfig includes "node" types globally.
const here = resolve(process.cwd());

export default defineConfig({
  resolve: {
    alias: {
      "bun:sqlite": resolve(here, "test/sqlite-shim.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      // Keep the bar honest without failing the suite over incidental lines.
      thresholds: {
        lines: 70,
        functions: 60,
        branches: 50,
      },
    },
  },
});
