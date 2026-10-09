// viroom R7e — /api/kanban + /api/profiles tests.
//
// Strategy: fake hermes CLI (test-bin/hermes-fake.sh) + HERMITES_BIN override
// (pola R1/R3) so the real adapter path runs with no hermes binary installed.

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { collectKanban, parseTaskList } from "../src/kanban";
import { collectProfiles, parseProfiles, parseProfileTable } from "../src/profiles";
import { clearHermesCache } from "../src/hermes";

const FAKE_HERMES = join(process.cwd(), "test-bin", "hermes-fake.sh");

async function withHermesEnv(vars: Record<string, string>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  clearHermesCache();
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearHermesCache();
  }
}

describe("parseTaskList (hermes kanban list --json)", () => {
  it("parses a bare array of tasks", () => {
    const tasks = parseTaskList(
      '[{"id":"t_1","title":"Fix login","status":"in_progress","assignee":"sanji","priority":2}]',
    );
    expect(tasks).toEqual([
      { id: "t_1", title: "Fix login", status: "in_progress", assignee: "sanji", priority: 2 },
    ]);
  });

  it("accepts a { tasks: [] } wrapper and a null assignee", () => {
    const tasks = parseTaskList('{"tasks":[{"id":"t_2","title":"Ship","status":"done","assignee":null}]}');
    expect(tasks).toEqual([
      { id: "t_2", title: "Ship", status: "done", assignee: null },
    ]);
  });

  it("returns null for non-JSON (triggers fallback, never throws)", () => {
    expect(parseTaskList("not json at all")).toBeNull();
  });

  it("drops entries without title or status", () => {
    expect(parseTaskList('[{"id":"t_3","status":"done"}]')).toEqual([]);
  });
});

describe("collectKanban (fan-out per board)", () => {
  beforeEach(() => clearHermesCache());

  it("returns ok with tasks from every board", async () => {
    await withHermesEnv(
      { HERMITES_BIN: FAKE_HERMES, FAKE_HERMES_BOARDS: "alpha beta" },
      async () => {
        const src = await collectKanban();
        expect(src.availability).toBe("ok");
        expect(src.data?.boards.map((b) => b.slug)).toEqual(["alpha", "beta"]);
        // 2 tasks per board, each tagged with its board.
        expect(src.data?.tasks).toHaveLength(4);
        expect(src.data?.tasks.filter((t) => t.board === "alpha")).toHaveLength(2);
        expect(src.data?.failedBoards).toBeUndefined();
      },
    );
  });

  it("keeps ok with failedBoards when one board fails (partial failure)", async () => {
    await withHermesEnv(
      {
        HERMITES_BIN: FAKE_HERMES,
        FAKE_HERMES_BOARDS: "alpha beta",
        FAKE_HERMES_FAIL_BOARD: "beta",
      },
      async () => {
        const src = await collectKanban();
        expect(src.availability).toBe("ok");
        expect(src.data?.failedBoards).toEqual(["beta"]);
        expect(src.data?.tasks.every((t) => t.board === "alpha")).toBe(true);
      },
    );
  });

  it("falls back to the active board when boards list fails", async () => {
    await withHermesEnv(
      { HERMITES_BIN: FAKE_HERMES, FAKE_HERMES_FAIL_BOARDS: "1" },
      async () => {
        const src = await collectKanban();
        expect(src.availability).toBe("ok");
        expect(src.data?.boards).toEqual([]);
        expect(src.data?.tasks).toHaveLength(2);
      },
    );
  });

  it("returns unavailable when hermes is missing entirely", async () => {
    await withHermesEnv({ HERMITES_BIN: "/nonexistent/hermes" }, async () => {
      const src = await collectKanban();
      expect(src.availability).toBe("unavailable");
      expect(src.data).toBeNull();
      expect(src.error).toBeTruthy();
    });
  });
});

describe("GET /api/kanban (live Elysia app)", () => {
  let app: { handle: (r: Request) => Promise<Response> };

  beforeAll(async () => {
    process.env.HERMITES_BIN = FAKE_HERMES;
    process.env.FAKE_HERMES_BOARDS = "alpha";
    clearHermesCache();
    app = (await import("../src/index")).default as unknown as typeof app;
  });

  afterAll(() => {
    delete process.env.HERMITES_BIN;
    delete process.env.FAKE_HERMES_BOARDS;
    clearHermesCache();
  });

  const request = (path: string) =>
    app.handle(new Request(`http://localhost${path}`));

  it("returns 200 ok envelope with tasks+boards+fetchedAt", async () => {
    const res = await request("/api/kanban");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      data: { tasks: unknown[]; boards: unknown[]; fetchedAt: string } | null;
      error: string | null;
    };
    expect(body.status).toBe("ok");
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data?.tasks)).toBe(true);
    expect(body.data?.tasks.length).toBeGreaterThan(0);
    expect(body.data?.boards).toHaveLength(1);
    expect(typeof body.data?.fetchedAt).toBe("string");
  });

  it("GET /api/kanban returns unavailable envelope when CLI missing", async () => {
    const original = process.env.HERMITES_BIN;
    process.env.HERMITES_BIN = "/nonexistent/hermes";
    clearHermesCache();
    try {
      const { api } = await import("../src/api");
      const res = await api.handle(new Request("http://localhost/api/kanban"));
      const body = (await res.json()) as {
        status: string;
        data: unknown;
        error: string | null;
      };
      expect(res.status).toBe(200);
      expect(body.status).toBe("unavailable");
      expect(body.data).toBeNull();
      expect(typeof body.error).toBe("string");
      expect(body.error).toMatch(/hermes|not|missing|ENOENT/i);
    } finally {
      if (original === undefined) delete process.env.HERMITES_BIN;
      else process.env.HERMITES_BIN = original;
      clearHermesCache();
    }
  });
});