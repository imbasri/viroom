// viroom R7e — /api/profiles tests.

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import {
  collectProfiles,
  parseProfiles,
  parseProfileTable,
  parseProfileNames,
} from "../src/profiles";
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

// --- parser: bare-name output (legacy format, used by cron fixture too) ---

describe("parseProfileNames", () => {
  it("parses bare name-per-line output", () => {
    expect(parseProfileNames("sanji\nzoro\n  chopper\n")).toEqual([
      { name: "sanji", model: "Not configured", gateway: "Unknown" },
      { name: "zoro", model: "Not configured", gateway: "Unknown" },
      { name: "chopper", model: "Not configured", gateway: "Unknown" },
    ]);
  });
});

// --- parser: tabular output (Profile/Model/Gateway) ---

describe("parseProfileTable", () => {
  it("parses tabular output with gateway column", () => {
    const table =
      " Profile    Model     Gateway\n" +
      " ───────    ─────     ────────\n" +
      " ◆sanji     gpt-4o    running\n" +
      " zoro       gpt-4o    stopped\n";
    expect(parseProfileTable(table)).toEqual([
      { name: "sanji", model: "gpt-4o", gateway: "Running" },
      { name: "zoro", model: "gpt-4o", gateway: "Stopped" },
    ]);
  });

  it("returns null when there is no table header", () => {
    expect(parseProfileTable("just a name\nsanji")).toBeNull();
  });
});

describe("parseProfiles (dispatch)", () => {
  it("detects the tabular format first", () => {
    // parseProfiles must prefer parseProfileTable for tabular, else bare names.
    const table =
      " Profile    Model     Gateway\n" +
      " ◆sanji     gpt-4o    running\n";
    expect(parseProfiles(table)).toEqual([
      { name: "sanji", model: "gpt-4o", gateway: "Running" },
    ]);
  });

  it("falls back to bare-name parsing", () => {
    expect(parseProfiles("sanji\nzoro").map((p) => p.name)).toEqual(["sanji", "zoro"]);
  });

  it("returns [] for 'No profiles' sentinel", () => {
    expect(parseProfiles("No profiles configured")).toEqual([]);
  });

  it("returns null for truly unrecognised output", () => {
    expect(parseProfiles("123 garbage")).toBeNull();
  });
});

// --- collector: real fake CLI round-trip ---

describe("collectProfiles (fake CLI)", () => {
  beforeEach(() => clearHermesCache());

  it("parses tabular profile list", async () => {
    await withHermesEnv(
      { HERMITES_BIN: FAKE_HERMES, FAKE_HERMES_PROFILES: "sanji zoro", FAKE_HERMES_PROFILE_TABLE: "1" },
      async () => {
        const src = await collectProfiles();
        expect(src.availability).toBe("ok");
        expect(src.data?.profiles).toHaveLength(2);
        expect(src.data?.profiles[0]).toMatchObject({ name: "sanji", gateway: "Running" });
        expect(src.data?.profiles[1]).toMatchObject({ name: "zoro", gateway: "Running" });
        expect(src.data?.fetchedAt).toBeTruthy();
      },
    );
  });

  it("parses bare-name profile list", async () => {
    await withHermesEnv(
      { HERMITES_BIN: FAKE_HERMES, FAKE_HERMES_PROFILES: "sanji zoro" },
      async () => {
        const src = await collectProfiles();
        expect(src.availability).toBe("ok");
        expect(src.data?.profiles.map((p) => p.name)).toEqual(["sanji", "zoro"]);
        // bare-name form → gateway Unknown, model "Not configured".
        expect(src.data?.profiles.every((p) => p.gateway === "Unknown")).toBe(true);
      },
    );
  });

  it("returns unavailable when hermes CLI is missing", async () => {
    await withHermesEnv({ HERMITES_BIN: "/nonexistent/hermes" }, async () => {
      const src = await collectProfiles();
      expect(src.availability).toBe("unavailable");
      expect(src.data).toBeNull();
      expect(src.error).toBeTruthy();
    });
  });
});

describe("GET /api/profiles (live Elysia app)", () => {
  let app: { handle: (r: Request) => Promise<Response> };

  beforeAll(async () => {
    process.env.HERMITES_BIN = FAKE_HERMES;
    process.env.FAKE_HERMES_PROFILE_TABLE = "1";
    process.env.FAKE_HERMES_PROFILES = "sanji zoro";
    clearHermesCache();
    app = (await import("../src/index")).default as unknown as typeof app;
  });

  afterAll(() => {
    delete process.env.HERMITES_BIN;
    delete process.env.FAKE_HERMES_PROFILE_TABLE;
    clearHermesCache();
  });

  const request = (path: string) =>
    app.handle(new Request(`http://localhost${path}`));

  it("returns 200 ok envelope with profiles+fetchedAt", async () => {
    const res = await request("/api/profiles");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      data: { profiles: unknown[]; fetchedAt: string } | null;
      error: string | null;
    };
    expect(body.status).toBe("ok");
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data?.profiles)).toBe(true);
    expect(body.data?.profiles.length).toBeGreaterThan(0);
    expect(typeof body.data?.fetchedAt).toBe("string");
  });
});
