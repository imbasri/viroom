/**
 * /api/office   — deterministic layout + presence state for n people, JSON.
 * /office-ws    — live presence channel: snapshot on connect, broadcast updates.
 *
 * Uses the same lib as the browser, so positions match on both sides.
 * Standalone Bun server (Bun.serve + native WebSocket) so it runs without the
 * Elysia app. `three` is NOT used here — the browser lazily loads it.
 */
import { extname, join } from "node:path";
import { createLayout, stateToPosition, type Layout, type Person, type Presence } from "../lib/office3d-layout.ts";

const PORT = Number(process.env.PORT ?? 3001);
const N = Number(process.env.N ?? 12);

/**
 * Seed a deterministic presence state for n people. The first few take turns
 * through desk / meeting / lounge; the rest stay at their desks. Away is
 * reserved for a user-initiated toggle over the WS.
 */
function seedPeople(n: number): Person[] {
  const people: Person[] = [];
  for (let i = 0; i < n; i++) {
    const state = i % 3 === 0 ? "meeting" : i % 3 === 1 ? "desk" : "lounge";
    people.push({ id: `p${i}`, state, seat: i % 5 });
  }
  return people;
}

function snapshot(layout: Layout, people: Person[]) {
  return {
    n: layout.n,
    layout,
    people: people.map((p) => ({ ...p, pos: stateToPosition(layout, p) })),
  };
}

/** In-memory presence; @sanji swaps for the real store later. */
let layout = createLayout(N);
let people = seedPeople(layout.n);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".json": "application/json",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
};

export interface OfficeSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onmessage?: (ev: { data: unknown }) => void;
  readyState: number;
}

const clients = new Set<OfficeSocket>();

function broadcast(msg: unknown) {
  const data = JSON.stringify(msg);
  for (const c of clients) {
    if (c.readyState === 1 /* OPEN */) c.send(data);
  }
}

function handleOfficeState(m: unknown) {
  let parsed: any;
  try {
    parsed = JSON.parse(String(m));
  } catch {
    return;
  }
  if (parsed?.type === "set-state" && people.some((p) => p.id === parsed.id)) {
    const p = people.find((x) => x.id === parsed.id)!;
    const st = parsed.state;
    if (st === "desk" || st === "meeting" || st === "lounge" || st === "away") p.state = st as Presence;
    if (typeof parsed.seat === "number") p.seat = parsed.seat;
    broadcast({ type: "update", id: p.id, state: p.state, pos: stateToPosition(layout, p) });
  }
}

export const office = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/office-ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) return new Response(null, { status: 101 });
      return new Response("websocket upgrade only", { status: 426 });
    }
    if (url.pathname === "/api/office") {
      const n = Number(url.searchParams.get("n") ?? N);
      const l = n === N ? layout : createLayout(n);
      const ppl = n === N ? people : seedPeople(l.n);
      return new Response(JSON.stringify(snapshot(l, ppl)), {
        headers: { "Content-Type": "application/json" },
      });
    }
    // static
    let rel = url.pathname.replace(/^\/+/, "");
    if (rel === "" || rel === "index.html") rel = "web/index.html";
    const file = join(process.cwd(), rel);
    const f = Bun.file(file);
    return f
      .exists()
      .then((ok: boolean) =>
        ok
          ? new Response(f, {
              headers: { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" },
            })
          : new Response("not found", { status: 404 }),
      )
      .catch(() => new Response("not found", { status: 404 }));
  },
  websocket: {
    open(ws: OfficeSocket) {
      clients.add(ws);
      ws.send(JSON.stringify({ type: "snapshot", ...snapshot(layout, people) }));
    },
    message(ws: OfficeSocket, raw: string | Buffer) {
      handleOfficeState(raw);
    },
    close(ws: OfficeSocket) {
      clients.delete(ws);
    },
  },
});

if (import.meta.main) {
  console.log(`office3d @ http://localhost:${PORT}  (n=${N}, ws at /office-ws)`);
}

export default office;
