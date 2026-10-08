// viroom backend — SQLite init + schema.
// Bun built-in SQLite (node:sqlite, available in Bun runtime).
// Tables: agent_states, sessions, settings.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH = process.env.VIROOM_DB ?? join(process.cwd(), "data", "viroom.db");

let db: Database | null = null;

/** Return the shared DB handle, creating the schema on first use. */
export function getDb(): Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

/** Reset the handle (for tests). */
export function closeDb(): void {
  db?.close();
  db = null;
}

function migrate(d: Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS agent_states (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'idle'
                  CHECK (status IN ('idle','active','error')),
      position_x  REAL NOT NULL DEFAULT 0,
      position_y  REAL NOT NULL DEFAULT 0,
      payload     TEXT NOT NULL DEFAULT '{}',
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id    TEXT NOT NULL,
      started_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at    TEXT,
      FOREIGN KEY (agent_id) REFERENCES agent_states(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
