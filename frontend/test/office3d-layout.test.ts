// @vitest-environment node
// R7b — Office3D layout test (vitest port of tests/office3d-layout.test.ts).
// Pure-logic: createLayout + stateToPosition. No React, no network.

import { describe, it, expect } from "vitest";
import { createLayout, stateToPosition, type Layout, type Person } from "../../lib/office3d-layout";

describe("createLayout (vitest)", () => {
  it("is deterministic for the same n", () => {
    expect(createLayout(10)).toEqual(createLayout(10));
  });

  it("varies with n (1 vs 24 differ)", () => {
    expect(createLayout(1).desks).not.toEqual(createLayout(24).desks);
  });

  it.each([1, 5, 12] as const)(
    "produces exactly n desk positions for n=%i (capped at 24)",
    (n) => {
      const l = createLayout(n);
      expect(l.desks.length).toBe(n);
      for (const d of l.desks) {
        expect(d.pos.x).toBeGreaterThanOrEqual(l.room.minX);
        expect(d.pos.x).toBeLessThanOrEqual(l.room.maxX);
        expect(d.pos.z).toBeGreaterThanOrEqual(l.room.minZ);
        expect(d.pos.z).toBeLessThanOrEqual(l.room.maxZ);
      }
    }
  );

  it("clamps n to 1..24", () => {
    expect(createLayout(0).n).toBe(1);
    expect(createLayout(-3).n).toBe(1);
    expect(createLayout(999).n).toBe(24);
  });
});

describe("stateToPosition", () => {
  const l: Layout = createLayout(8);

  it("desk -> own desk slot", () => {
    const p: Person = { id: "a", state: "desk", seat: 0 };
    expect(stateToPosition(l, p)).toEqual(l.desks[0].pos);
  });

  it("meeting -> meeting seat", () => {
    const p: Person = { id: "a", state: "meeting", seat: 3 };
    expect(stateToPosition(l, p)).toEqual(l.meeting[3].pos);
  });

  it("lounge -> lounge seat", () => {
    const p: Person = { id: "a", state: "lounge", seat: 1 };
    expect(stateToPosition(l, p)).toEqual(l.lounge[1].pos);
  });

  it("away -> entrance", () => {
    const p: Person = { id: "a", state: "away" };
    expect(stateToPosition(l, p)).toEqual(l.entrance);
  });

  it("defaults seat to 0", () => {
    const p: Person = { id: "a", state: "lounge" };
    expect(stateToPosition(l, p)).toEqual(l.lounge[0].pos);
  });
});
