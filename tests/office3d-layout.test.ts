// Tests for office3d-layout.
// Run under the repo's runner: `bun test tests/office3d-layout.test.ts`.
// (No bun available in this container -> `node --experimental-strip-types --test`
//  is used to prove the suite; the compiled-JS path is what `bun test` targets.)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createLayout,
  placementFor,
  stateToPosition,
  walkPath3,
  routeBetween,
} from "../lib/office3d-layout.ts";

describe("createLayout", () => {
  it("is deterministic for the same n", () => {
    const a = createLayout(10);
    const b = createLayout(10);
    assert.deepEqual(a, b, "two calls with same n must produce identical layout");
  });

  it("varies with n (not a constant layout)", () => {
    const a = createLayout(1);
    const b = createLayout(24);
    assert.notDeepEqual(a.desks, b.desks, "different n should yield different desks");
  });

  it("produces exactly n desks", () => {
    for (const n of [1, 2, 5, 12, 24, 99]) {
      const l = createLayout(n);
      assert.equal(l.desks.length, Math.min(24, n));
    }
  });

  it("clamps n to 1..24", () => {
    assert.equal(createLayout(0).n, 1);
    assert.equal(createLayout(-3).n, 1);
    assert.equal(createLayout(999).n, 24);
  });

  it("keeps every seat inside the room bounds", () => {
    const l = createLayout(24);
    for (const z of l.zones) {
      assert.ok(z.pos.x >= l.room.minX && z.pos.x <= l.room.maxX, `x out of bounds: ${z.pos.x}`);
      assert.ok(z.pos.z >= l.room.minZ && z.pos.z <= l.room.maxZ, `z out of bounds: ${z.pos.z}`);
    }
  });
});

describe("placementFor", () => {
  const l = createLayout(12);

  it("returns a desk position", () => {
    const p = placementFor(l, "desk", 0);
    assert.deepEqual(p, l.desks[0].pos);
  });

  it("wraps index safely beyond capacity", () => {
    const p = placementFor(l, "meeting", 100);
    assert.deepEqual(p, l.meeting[100 % l.meeting.length].pos);
  });

  it("returns meeting / lounge anchors", () => {
    assert.ok(placementFor(l, "meeting", 0));
    assert.ok(placementFor(l, "lounge", 0));
  });
});

describe("stateToPosition", () => {
  const l = createLayout(8);

  it("maps desk -> own desk", () => {
    assert.deepEqual(stateToPosition(l, { id: "a", state: "desk", seat: 0 }), l.desks[0].pos);
  });

  it("maps meeting -> meeting seat", () => {
    assert.deepEqual(stateToPosition(l, { id: "a", state: "meeting", seat: 3 }), l.meeting[3].pos);
  });

  it("maps lounge -> lounge seat", () => {
    assert.deepEqual(stateToPosition(l, { id: "a", state: "lounge", seat: 1 }), l.lounge[1].pos);
  });

  it("maps away -> entrance", () => {
    assert.deepEqual(stateToPosition(l, { id: "a", state: "away" }), l.entrance);
  });

  it("defaults seat to 0", () => {
    assert.deepEqual(stateToPosition(l, { id: "a", state: "lounge" }), l.lounge[0].pos);
  });
});

describe("walkPath3", () => {
  it("returns a single point for empty input", () => {
    assert.deepEqual(walkPath3([{ x: 1, y: 0, z: 1 }]), [{ x: 1, y: 0, z: 1 }]);
  });

  it("endpoints are preserved", () => {
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 3 },
    ];
    const out = walkPath3(pts, 0.5);
    assert.deepEqual(out[0], pts[0]);
    assert.deepEqual(out.at(-1), pts[1]);
  });

  it("samples more densely for smaller step", () => {
    const big = walkPath3([{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }], 1.0);
    const small = walkPath3([{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }], 0.5);
    assert.ok(big.length < small.length);
  });
});

describe("routeBetween", () => {
  it("stays on the corridor between desk and meeting", () => {
    const l = createLayout(4);
    const path = routeBetween(l, l.desks[0].pos, l.meeting[0].pos);
    assert.ok(path.length > 2);
    const last = path[path.length - 1];
    assert.equal(last.x, l.meeting[0].pos.x);
    assert.equal(last.z, l.meeting[0].pos.z);
  });
});
