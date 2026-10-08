// viroom API routes — Elysia.
//   GET    /api/health
//   GET    /api/agents /api/sessions /api/settings
//   POST   /api/agents /api/sessions
//   PATCH  /api/agents/:id
//   PUT    /api/settings
import { Elysia, t } from "elysia";
import { getDb } from "./db";
import type { AgentState, Session, Setting } from "./types";
import type { Statement } from "bun:sqlite";

// bun:sqlite Statement.run() accepts a positional binding array at runtime
// (verified: both `stmt.run(a,b)` and `stmt.run([a,b])` bind correctly).
function run(stmt: Statement, ...args: unknown[]) {
  // bun:sqlite binds a single array argument to consecutive ? placeholders.
  (stmt.run as unknown as (b: unknown[]) => { lastInsertRowid: unknown })([
    ...args,
  ]);
}

export const api = new Elysia({ prefix: "/api" })
  .get("/health", () => ({ ok: true, service: "viroom" }))
  .get("/agents", (): AgentState[] => {
    const d = getDb();
    return d
      .query(`SELECT id, name, status, position_x, position_y, payload, updated_at FROM agent_states ORDER BY id`)
      .all() as AgentState[];
  })
  .post(
    "/agents",
    ({ body }) => {
      const { id, name, payload } = body as {
        id: string;
        name: string;
        payload?: Record<string, string>;
      };
      const d = getDb();
      run(
        d.query(`INSERT INTO agent_states (id, name, payload) VALUES (?, ?, ?)`),
        id,
        name,
        JSON.stringify(payload ?? {})
      );
      return { id };
    },
    {
      body: t.Object({
        id: t.String(),
        name: t.String({ min: 1 }),
        payload: t.Optional(t.Record(t.String(), t.String())),
      }),
    }
  )
  .patch(
    "/agents/:id",
    ({ params, body }) => {
      const p = params as { id: string };
      const b = body as {
        status?: "idle" | "active" | "error";
        position_x?: number;
        position_y?: number;
        payload?: Record<string, string>;
      };
      const set: string[] = [];
      const args: unknown[] = [];
      if (b.status !== undefined) {
        set.push("status = ?");
        args.push(b.status);
      }
      if (b.position_x !== undefined) {
        set.push("position_x = ?");
        args.push(b.position_x);
      }
      if (b.position_y !== undefined) {
        set.push("position_y = ?");
        args.push(b.position_y);
      }
      if (b.payload !== undefined) {
        set.push("payload = ?");
        args.push(JSON.stringify(b.payload));
      }
      set.push("updated_at = datetime('now')");
      args.push(p.id);
      run(
        getDb().query(`UPDATE agent_states SET ${set.join(", ")} WHERE id = ?`),
        ...args
      );
      return { ok: true, id: p.id };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        status: t.Optional(t.String({ enum: ["idle", "active", "error"] })),
        position_x: t.Optional(t.Number()),
        position_y: t.Optional(t.Number()),
        payload: t.Optional(t.Record(t.String(), t.String())),
      }),
    }
  )
  .get("/sessions", (): Session[] => {
    const d = getDb();
    return d
      .query(`SELECT id, agent_id, started_at, ended_at FROM sessions ORDER BY id`)
      .all() as Session[];
  })
  .post(
    "/sessions",
    ({ body }) => {
      const { agent_id } = body as { agent_id: string };
      const stmt = getDb().query(`INSERT INTO sessions (agent_id) VALUES (?)`);
      const res = stmt.run(agent_id) as { lastInsertRowid?: unknown } & { lastInsertRowid?: unknown };
      const id = typeof res === "object" && res && "lastInsertRowid" in res ? Number((res as { lastInsertRowid: unknown }).lastInsertRowid) : 0;
      return { id };
    },
    { body: t.Object({ agent_id: t.String() }) }
  )
  .get("/settings", (): Setting[] => {
    const d = getDb();
    return d
      .query(`SELECT key, value FROM settings ORDER BY key`)
      .all() as Setting[];
  })
  .put(
    "/settings",
    ({ body }) => {
      const { key, value } = body as { key: string; value: string };
      run(
        getDb().query(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        ),
        key,
        value
      );
      return { ok: true, key, value };
    },
    { body: t.Object({ key: t.String(), value: t.String() }) }
  );

export type { AgentState, Session, Setting };
