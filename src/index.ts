// Elysia endpoints read-only dashboard atas hermes CLI.
//   GET /api/health    -> { cli: boolean, status: Availability, error?: string }
//   GET /api/runtime   -> { boards: string[], profiles: string[] } atau availability
//   GET /api/dashboard -> { boards, profiles, tasks[board] } agregat per board
//
// Semua source memakai Source<T> (availability/data/error) agar frontend bisa
// menampilkan state "unavailable" tanpa crash.

import { Elysia } from "elysia";

import {
  readHealth,
  readRuntime,
  readTasks,
  readInsights,
  readAllInsights,
  assertBoardSlug,
  type Source,
} from "./hermes";

const PORT = Number(process.env.PORT ?? 3000);

const envelope = (s: Source<unknown>) => {
  if (s.availability === "ok") return { status: "ok" as const, data: s.data };
  return { status: s.availability as "unavailable" | "error", data: null, error: s.error ?? undefined };
};

export const app = new Elysia()
  .get("/api/health", async () => {
    const s = await readHealth();
    const e = envelope(s);
    if (e.status === "ok") return { cli: (e.data as { cli: boolean }).cli, ...e };
    return { cli: false, ...e };
  })

  .get("/api/runtime", async () => {
    const s = await readRuntime();
    const e = envelope(s);
    if (e.status !== "ok") return e;
    return { status: "ok" as const, data: e.data as { boards: string[]; profiles: string[] } };
  })

  .get("/api/dashboard", async ({ query }) => {
    const board = String(query.board ?? "");
    const [runtime, health] = await Promise.all([readRuntime(), readHealth()]);
    let tasks: Source<unknown> | null = null;
    if (board) {
      try {
        assertBoardSlug(board);
        tasks = await readTasks(board);
      } catch {
        // invalid board slug -> report as error, tidak crash
        tasks = { availability: "error", data: null, error: `invalid board slug: ${board}` };
      }
    }
    return {
      cli: (envelope(health) as { data?: { cli: boolean } }).data?.cli ?? false,
      boards: (envelope(runtime) as { data?: { boards: string[] } }).data?.boards ?? [],
      profiles: (envelope(runtime) as { data?: { profiles: string[] } }).data?.profiles ?? [],
      board: board || null,
      tasks: tasks ? envelope(tasks) : null,
    };
  });

// Hapus `export` agar hanya jalan saat di-start langsung (bukan saat di-import test).
if (import.meta.main) {
  app.listen(PORT).onError((err) => console.error("dashboard server error:", err));
  console.log(`hermes-cli-adapter listening on http://localhost:${PORT}`);
}

export default app;
