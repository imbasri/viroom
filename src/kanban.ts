// viroom kanban collector — sumber data `GET /api/kanban`.
// READ-ONLY terhadap `hermes` CLI: fan-out per board (polalogger collectTasks dari
// src/hermes.ts), fallback ke daftar board saat `kanban boards list` tidak tersedia.
// Tidak pernah membuka SQLite kanban secara langsung.

import type { Source } from "./hermes";
import { hermesRun, parseBoardsJson, collectTasks, sourceOk, sourceUnavailable, sourceError } from "./hermes";
import type { KanbanBoard, TaskSummary } from "./types";

export interface KanbanBoardPayload {
  tasks: TaskSummary[];
  boards: KanbanBoard[];
  failedBoards?: string[];
  fetchedAt: string;
}

/**
 * Snapshot semua board: `hermes kanban boards list --json` lalu fan-out
 * `hermes kanban --board <slug> list --json`. Bila daftar board gagal/kosong,
 * fallback ke `hermes kanban list --json` (board aktif saja, pola ruang).
 */
export async function collectKanban(): Promise<Source<KanbanBoardPayload>> {
  const fetchedAt = new Date().toISOString();
  try {
    const b = await hermesRun(["kanban", "boards", "list", "--json"]);
    const boards = b.exitCode === 0 ? parseBoardsJson(b.stdout) : [];
    if (boards.length > 0) {
      const src = await collectTasks(boards.map((x) => x.slug));
      if (src.availability === "ok" && src.data) {
        return {
          availability: "ok",
          data: {
            tasks: src.data.tasks,
            boards,
            ...(src.data.failedBoards ? { failedBoards: src.data.failedBoards } : {}),
            fetchedAt,
          },
          error: null,
        };
      }
      // Semua board gagal → coba fallback list aktif sebelum menyerah.
      if (src.availability !== "unavailable") return src as Source<KanbanBoardPayload>;
    }
    const r = await hermesRun(["kanban", "list", "--json"]);
    if (r.exitCode !== 0)
      return {
        availability: "unavailable",
        data: null,
        error: r.stderr.trim() || "hermes kanban list unavailable",
      };
    const tasks = parseTaskList(r.stdout);
    if (tasks === null)
      return { availability: "error", data: null, error: "could not parse kanban list output" };
    return {
      availability: "ok",
      data: { tasks, boards: boards.length ? boards : [], fetchedAt },
      error: null,
    };
  } catch (e) {
    return {
      availability: "error",
      data: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Parse stdout `hermes kanban list --json` → TaskSummary[]; `null` bila bukan daftar. */
export function parseTaskList(stdout: string): TaskSummary[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { tasks?: unknown }).tasks)
      ? (parsed as { tasks: unknown[] }).tasks
      : null;
  if (!list) return null;
  return list.flatMap((item): TaskSummary[] => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" && o.title.trim() ? o.title : typeof o.name === "string" ? o.name : "";
    const status = typeof o.status === "string" && o.status ? o.status : typeof o.state === "string" ? o.state : "";
    if (!title || !status) return [];
    const assignee = o.assignee == null ? null : String(o.assignee);
    const priority = Number.isFinite(Number(o.priority)) && o.priority != null ? Number(o.priority) : undefined;
    return [
      {
        id: String(o.id ?? ""),
        title,
        status,
        assignee,
        ...(priority !== undefined ? { priority } : {}),
      },
    ];
  });
}
