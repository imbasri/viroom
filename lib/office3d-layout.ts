/**
 * office3d-layout — deterministic spatial model for the ViRoom office.
 *
 * Pure, dependency-free, identical in browser and node. Everything the server
 * and the client compute MUST come from here so both agree on every position.
 *
 * Contract (kept intentionally small — see docs/research/03-frontend-ui.md):
 *   createLayout(n)        deterministic layout for n people (same n -> same bytes)
 *   placementFor(kind)     world position for a desk / meeting seat / lounge spot
 *   stateToPosition(state) presence state -> world position
 *   walkPath3(waypoints)   resample a polyline into walkable waypoints
 *   routeBetween(a, b)     L-shaped path through the corridor between two points
 */

export type Presence = 'desk' | 'meeting' | 'lounge' | 'away';
export type ZoneKind = 'desk' | 'meeting' | 'lounge' | 'lounge-area';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Zone {
  kind: ZoneKind;
  index: number;
  /** seat / anchor position, y is on the floor */
  pos: Vec3;
  /** where an occupant should face while using this zone */
  facing: number;
}

export interface Layout {
  n: number;
  /** room extent, centre at origin, floor at y=0 */
  room: Rect;
  /** main corridor the walker follows, west -> east */
  corridorZ: number;
  zones: Zone[];
  desks: Zone[];
  meeting: Zone[];
  lounge: Zone[];
  /** door / spawn point used by the `away` state */
  entrance: Vec3;
}

/** mulberry32 — small, fast, fully deterministic PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROOM: Rect = { minX: -11, maxX: 11, minZ: -8, maxZ: 8 };
const DESK_COLS_MAX = 6;
const DESK_DX = 3.2;
const DESK_DZ = 2.4;
const MEETING_SEATS = 8;
const LOUNGE_SEATS = 6;

function clamp(lo: number, v: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Deterministic layout for `n` people. Pure function of `n`: no Date, no
 * Math.random, no iteration over object keys. n is clamped to 1..24.
 */
export function createLayout(n: number): Layout {
  const count = Math.min(24, Math.max(1, Math.floor(n) || 1));
  const rand = rng(0x0ff1ce ^ count);

  const cols = Math.min(DESK_COLS_MAX, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);

  // Centre the desk block in the WEST half so meeting + lounge stay clear of
  // it on the east end. cols/rows shrink with n (1 -> 1x1, 24 -> 6x4).
  const blockW = (cols - 1) * DESK_DX;
  const blockD = (rows - 1) * DESK_DZ;
  const westEdge = ROOM.minX + 1.2;
  const eastEdge = ROOM.maxX - 2.0; // east zone column sits just left of the wall
  const centerX = (westEdge + eastEdge) / 2;
  const halfW = blockW / 2;
  // Clamp the block's top-left so it never overflows or underflows.
  const startX = clamp(westEdge, centerX - halfW, eastEdge - blockW);
  const startZ = clamp(
    ROOM.minZ + 1.4,
    (ROOM.minZ + ROOM.maxZ) / 2 - blockD / 2,
    ROOM.maxZ - 1.4 - blockD,
  );

  const desks: Zone[] = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    // tiny deterministic jitter keeps the block from looking like graph paper
    const jx = (rand() - 0.5) * 0.12;
    const jz = (rand() - 0.5) * 0.12;
    desks.push({
      kind: 'desk',
      index: i,
      pos: {
        x: round3(startX + c * DESK_DX + jx),
        y: 0,
        z: round3(startZ + r * DESK_DZ + jz),
      },
      // face east, into the room
      facing: round3(-Math.PI / 2 + (rand() - 0.5) * 0.35),
    });
  }

  const meeting: Zone[] = [];
  const mx = ROOM.maxX - 2.6;
  const mz = ROOM.minZ + 2.4;
  for (let i = 0; i < MEETING_SEATS; i++) {
    meeting.push({
      kind: 'meeting',
      index: i,
      pos: { x: round3(mx), y: 0, z: round3(mz + i * 1.05) },
      facing: round3(-Math.PI + (rand() - 0.5) * 0.2),
    });
  }

  const lounge: Zone[] = [];
  const lx = ROOM.maxX - 2.6;
  for (let i = 0; i < LOUNGE_SEATS; i++) {
    lounge.push({
      kind: 'lounge',
      index: i,
      pos: { x: round3(lx), y: 0, z: round3(mz + i * 1.05) },
      facing: round3(-Math.PI / 2 + (rand() - 0.5) * 0.4),
    });
  }

  const zones = [...desks, ...meeting, ...lounge];
  const corridorZ = round3((ROOM.minZ + ROOM.maxZ) / 2);

  return {
    n: count,
    room: ROOM,
    corridorZ,
    zones,
    desks,
    meeting,
    lounge,
    entrance: { x: ROOM.minX + 0.8, y: 0, z: round3(ROOM.minZ + 1.2) },
  };
}

/**
 * Position for a zone. `kind` is desk | meeting | lounge; the index wraps, so
 * a seat index beyond capacity is safe rather than undefined.
 */
export function placementFor(
  layout: Layout,
  kind: 'desk' | 'meeting' | 'lounge',
  index = 0,
): Vec3 {
  const pool =
    kind === 'desk' ? layout.desks : kind === 'meeting' ? layout.meeting : layout.lounge;
  const z = pool[index % pool.length];
  return { ...z.pos };
}

export interface Person {
  id: string;
  state: Presence;
  /** which seat within the zone, defaults to their own index */
  seat?: number;
}

/**
 * state-to-position: presence state -> world position. This is the single
 * mapping used by both the 2D renderer and the 3D scene so an avatar never
 * appears in two places at once.
 */
export function stateToPosition(layout: Layout, person: Person): Vec3 {
  const i = person.seat ?? 0;
  switch (person.state) {
    case 'desk':
      return placementFor(layout, 'desk', i);
    case 'meeting':
      return placementFor(layout, 'meeting', i);
    case 'lounge':
      return placementFor(layout, 'lounge', i);
    case 'away':
      return { ...layout.entrance };
  }
}

/**
 * walkPath3 — resample a polyline into evenly spaced 3D waypoints.
 * `step` is metres between waypoints; a straight hop across the room yields
 * `max(1, round(dist/step))` points plus the destination.
 */
export function walkPath3(waypoints: Vec3[], step = 0.6): Vec3[] {
  if (waypoints.length < 2) return waypoints.map(clone);
  const out: Vec3[] = [clone(waypoints[0])];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const segs = Math.max(1, Math.round(dist / step));
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      out.push({
        x: round3(a.x + (b.x - a.x) * t),
        y: round3(a.y + (b.y - a.y) * t),
        z: round3(a.z + (b.z - a.z) * t),
      });
    }
  }
  return out;
}

/** L-shaped route through the corridor: never clips the desk block. */
export function routeBetween(layout: Layout, from: Vec3, to: Vec3): Vec3[] {
  return walkPath3([
    clone(from),
    { x: from.x, y: 0, z: layout.corridorZ },
    { x: to.x, y: 0, z: to.z },
    clone(to),
  ]);
}

function clone(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

/** 3 decimals: kills float noise so JSON output is byte-stable across runs. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
