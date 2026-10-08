// Test untuk Hermes CLI adapter + Elysia endpoints.
//
// Pakai fake binary (mock hermes) agar bisa verifikasi contract tanpa binary
// asli yang belum ada di docker. Juga test Elysia endpoints via app.fetch.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

import {
  sourceOk,
  sourceUnavailable,
  sourceError,
  assertProfileName,
  assertBoardSlug,
  parseBoardsList,
  parseProfilesList,
  hermesRun,
  readHealth,
  readRuntime,
  readTasks,
  clearHermesCache,
  type Source,
} from "../src/hermes";
import app from "../src/index";

// ---------- unit: Source wrappers ----------
describe("Source<T>", () => {
  it("ok wrapper sets availability=ok + data + error=null", () => {
    const s: Source<number> = sourceOk(42);
    expect(s).toEqual({ availability: "ok", data: 42, error: null });
  });
  it("unavailable wrapper sets availability=unavailable + error", () => {
    const s = sourceUnavailable("nope");
    expect(s).toEqual({ availability: "unavailable", data: null, error: "nope" });
  });
  it("error wrapper sets availability=error + error", () => {
    const s = sourceError("boom");
    expect(s).toEqual({ availability: "error", data: null, error: "boom" });
  });
});

// ---------- unit: regex guard ----------
describe("regex guard", () => {
  it("accepts valid profile names", () => {
    assertProfileName("sanji");
    assertProfileName("Zoro_2");
    assertProfileName("a");
  });
  it("rejects invalid profile names", () => {
    expect(() => assertProfileName("")).toThrow();
    expect(() => assertProfileName("9bad")).toThrow(); // leading digit
    expect(() => assertProfileName("bad/slash")).toThrow();
    expect(() => assertProfileName("x".repeat(65))).toThrow(); // >64
  });
  it("accepts valid board slugs (lowercase)", () => {
    assertBoardSlug("viroom");
    assertBoardSlug("my-board-2");
  });
  it("rejects uppercase / bad board slugs", () => {
    expect(() => assertBoardSlug("ViRoom")).toThrow();
    expect(() => assertBoardSlug("")).toThrow();
    expect(() => assertBoardSlug("x".repeat(65))).toThrow();
  });
});

// ---------- unit: parsers ----------
describe("parsers", () => {
  it("parseBoardsList reads JSON array of {slug}", () => {
    expect(parseBoardsList('[{"slug":"a"},{"slug":"b"}]')).toEqual(["a", "b"]);
  });
  it("parseBoardsList falls back to line filter (non-JSON)", () => {
    expect(parseBoardsList("viroom\nother\n###")).toEqual(["viroom", "other"]);
  });
  it("parseProfilesList reads JSON array of {name}", () => {
    expect(parseProfilesList('[{"name":"sanji"},{"name":"zoro"}]')).toEqual(["sanji", "zoro"]);
  });
  it("parseProfilesList strips * prefix", () => {
    expect(parseProfilesList("* sanji\n zoro\n")).toEqual(["sanji", "zoro"]);
  });
});

// ---------- hermesRun via fake binary ----------
// Buat fake hermes script yang output versi sesuai arg.
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeFakeHermes(): string {
  // Buat fake bin di dalam workspace (bukan /tmp) karena /tmp mount noexec/noexec
  // di Docker ini menolak exec permission.
  const dir = join(__dirname, "..", "test-bin");
  mkdirSync(dir, { recursive: true });
  const bin = join(dir, "fake-hermes.sh");
  const script = [
    "#!/usr/bin/env bash",
    'cmd="$1"',
    'shift 2>/dev/null',
    'case "$cmd" in',
    '  --version) echo "hermes 0.9.9" ;;',
    '  kanban)',
    '    if [ "$1" = "--board" ]; then',
    '      echo "board $2: no tasks (test)" >&2; exit 3',
    '    fi',
    '    echo \'[{"slug":"alpha"},{"slug":"beta"}]\' ;;',
    '  profile)',
    '    printf \'* sanji\\nzoro\\n\' ;;',
    '  *) echo "unknown cmd" >&2; exit 3 ;;',
    'esac',
  ].join("\n");
  writeFileSync(bin, script);
  chmodSync(bin, 0o755);
  return bin;
}

describe("hermesRun + high-level readers (fake binary)", () => {
  const fake = makeFakeHermes();

  it("--version succeeds with exitCode 0", async () => {
    process.env.HERMITES_BIN = fake; // override binary for this run
    clearHermesCache();
    const r = await hermesRun(["--version"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("hermes 0.9.9");
    expect(r.timedOut).toBe(false);
  });

  it("readHealth returns ok + cli:true", async () => {
    process.env.HERMITES_BIN = fake;
    clearHermesCache();
    const s = await readHealth();
    expect(s.availability).toBe("ok");
    expect(s.data).toEqual({ cli: true });
  });

  it("readRuntime parses boards + profiles", async () => {
    process.env.HERMITES_BIN = fake;
    clearHermesCache();
    const s = await readRuntime();
    expect(s.availability).toBe("ok");
    expect(s.data?.boards).toEqual(["alpha", "beta"]);
    expect(s.data?.profiles).toEqual(["sanji", "zoro"]);
  });

  it("readTasks rejects invalid board slug (regex guard)", async () => {
    const s = await readTasks("Bad Slug/");
    expect(s.availability).toBe("error");
    expect(s.error).toMatch(/invalid board slug/i);
    expect(s.data).toBeNull();
  });

  it("readTasks returns empty for board with no JSON array stdout", async () => {
    process.env.HERMITES_BIN = fake;
    clearHermesCache();
    // board "viroom" -> fake bin falls to *) branch exit 3 -> unavailable
    const s = await readTasks("viroom");
    expect(s.availability).toBe("unavailable");
  });

  it("cache dedups identical in-flight calls", async () => {
    process.env.HERMITES_BIN = fake;
    clearHermesCache();
    // kedua pemanggilan identik harus share 1 in-flight promise
    const [a, b] = await Promise.all([hermesRun(["--version"]), hermesRun(["--version"])]);
    expect(a).toBe(b); // same object reference (dedup in-flight)
  });

  it("cache TTL returns stale value within 10s", async () => {
    process.env.HERMITES_BIN = fake;
    clearHermesCache();
    const first = await hermesRun(["--version"]);
    const second = await hermesRun(["--version"]);
    expect(second).toBe(first); // served from cache (same reference)
  });
});

// ---------- Elysia endpoints (via bun:testing fetch on running app) ----------
// Elysia `app.fetch(path)` butuh Request arg (bukan string) di Elysia 1.4.30.
// Test endpoint pakai `fetch(path)` native terhadap app.listen di port ephemeral.
describe("Elysia endpoints (live fetch)", () => {
  let server: { stop: () => void };
  let base: string;
  const fake = makeFakeHermes();

  beforeAll(async () => {
    process.env.HERMITES_BIN = fake;
    const port = 3456 + Math.floor(Math.random() * 100);
    const s = app.listen({ port });
    base = `http://127.0.0.1:${port}`;
    server = { stop: () => s.stop(false) };
  });

  afterAll(() => {
    server?.stop();
  });

  it("GET /api/health -> ok envelope", async () => {
    clearHermesCache();
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.cli).toBe(true);
    expect(body.status).toBe("ok");
  });

  it("GET /api/runtime -> boards + profiles", async () => {
    clearHermesCache();
    const res = await fetch(`${base}/api/runtime`);
    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe("ok");
    expect(body.data.boards).toEqual(["alpha", "beta"]);
    expect(body.data.profiles).toEqual(["sanji", "zoro"]);
  });

  it("GET /api/dashboard with board=viroom -> tasks unavailable envelope", async () => {
    clearHermesCache();
    const res = await fetch(`${base}/api/dashboard?board=viroom`);
    const body = (await res.json()) as { boards?: string[]; profiles?: string[]; tasks: unknown };
    expect(body.boards).toEqual(["alpha", "beta"]);
    expect(body.profiles).toEqual(["sanji", "zoro"]);
    expect((body.tasks as { status: string }).status).toBe("unavailable"); // fake bin: viroom -> exit 3
  });

  it("GET /api/dashboard with bad board -> tasks error envelope, no crash", async () => {
    clearHermesCache();
    const res = await fetch(`${base}/api/dashboard?board=Bad/S`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.tasks.status).toBe("error");
    expect(body.tasks.error).toMatch(/invalid board slug/i);
  });

  it("GET /api/dashboard without board -> tasks=null", async () => {
    clearHermesCache();
    const res = await fetch(`${base}/api/dashboard`);
    const body = (await res.json()) as Record<string, any>;
    expect(body.board).toBe(null);
    expect(body.tasks).toBe(null);
  });
});
