// SQLite shim — lets `bun:sqlite`-importing source run under Node + Vitest.
// In Bun the real `bun:sqlite` is used; this module is only loaded via the
// vitest `resolve.alias` (bun:sqlite -> ./test/sqlite-shim.ts).
// ponytail: only covers the surface src/db.ts + src/api.ts rely on
// (Database.query/exec/close; Statement.run/all/get/values). Extend this shim
// if new bun:sqlite features are needed; prefer a real driver otherwise.

// node:sqlite ships an async-style Database (v26); the Bun API's sync surface
// is small enough that we delegate to node:sqlite directly.
// @ts-expect-error node:sqlite types are not yet in @types for this toolchain.
import { Database as NodeDatabase } from "node:sqlite";

type Stmt = {
  run: (...a: unknown[]) => { lastInsertRowid: unknown; changes: number };
  all: (...a: unknown[]) => Record<string, unknown>[];
  get: (...a: unknown[]) => Record<string, unknown> | undefined;
};

export class Statement {
  private stmt: Stmt;
  constructor(stmt: unknown) {
    this.stmt = stmt as Stmt;
  }

  private flatten(args: unknown[]): unknown[] {
    const out: unknown[] = [];
    for (const a of args) {
      if (Array.isArray(a)) out.push(...a);
      else out.push(a);
    }
    return out;
  }

  run(...args: unknown[]) {
    return this.stmt.run(...this.flatten(args));
  }
  all(...args: unknown[]) {
    return this.stmt.all(...this.flatten(args));
  }
  get(...args: unknown[]) {
    return this.stmt.get(...this.flatten(args));
  }
  values(...args: unknown[]) {
    return this.stmt.all(...this.flatten(args)).map((r) => Object.values(r));
  }
}

export class Database {
  private db: InstanceType<typeof NodeDatabase>;
  constructor(path: string) {
    this.db = new NodeDatabase(path);
  }

  query(sql: string): Statement {
    return new Statement((this.db as unknown as { prepare: (s: string) => Stmt }).prepare(sql));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}
