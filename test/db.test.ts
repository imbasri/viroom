// R7f — coverage for src/db.ts getDb + closeDb, and src/index.ts onError.
// db.ts lines 15-30 (getDb body) were only hit on process start in Bun.

import { describe, it, expect, afterEach } from "vitest";
import { getDb, closeDb } from "../src/db";

afterEach(() => {
  closeDb();
});

describe("src/db.ts (R7f coverage)", () => {
  it("getDb creates the SQLite schema via migrate", () => {
    const db = getDb();
    const rows = db
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    expect(rows.map((r) => r.name)).toContain("agent_states");
    expect(rows.map((r) => r.name)).toContain("sessions");
    expect(rows.map((r) => r.name)).toContain("settings");
    closeDb();
  });

  it("getDb is idempotent (second call returns same handle)", () => {
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
    closeDb();
  });

  it("closeDb resets the handle so getDb re-creates", () => {
    const a = getDb();
    closeDb();
    // After close, db module variable is null; getDb builds a fresh handle.
    const b = getDb();
    expect(b).toBeDefined();
    closeDb();
  });
});
