// R7c — Kanban board page (read-only view of /api/kanban).
//
// Frontend only. Data from GET /api/kanban (R7e @sanji wires the route).
// Consumes the shared shell: Layout + useSource polling 10s; shadcn primitives.
// Columns follow the fixed Hermes board order with unseen statuses appended.
// Task detail dialog attempts GET /api/kanban/:id and degrades gracefully
// if the endpoint / detail data are unavailable.
//
// Types matched to R7e envelope:
//   GET /api/kanban → { status: "ok"|"unavailable"|"error",
//                      data: { tasks, boards?, failedBoards?, fetchedAt? } | null,
//                      fetchedAt?, error? }

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useSource } from "@/lib/use-source";
import { Layout } from "@/lib/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// --- types (locked for R7e; sync with src/types.ts TaskSummary) ---

export interface KanbanTask {
  id: string;
  title: string;
  status: string;
  assignee?: string;
  priority?: number;
  board?: string;
  private?: boolean;
}

export interface KanbanBoard {
  slug: string;
  name: string;
  current: boolean;
  total: number;
}

export interface KanbanEnvelope {
  status: "ok" | "unavailable" | "error";
  data: { tasks?: KanbanTask[]; boards?: KanbanBoard[]; failedBoards?: string[]; fetchedAt?: string } | null;
  fetchedAt?: string;
  error?: string;
}

const UNASSIGNED = "(unassigned)";

// Fixed Hermes board order; unseen statuses appended at the end.
const BOARD_COLUMNS = ["triage", "todo", "ready", "running", "blocked", "done"];

function orderedStatuses(statuses: string[], grouped: boolean): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const status of statuses) {
    if (seen.has(status)) continue;
    seen.add(status);
    ordered.push(status);
  }
  const byColumn = (a: string, b: string) => {
    const ai = BOARD_COLUMNS.indexOf(a);
    const bi = BOARD_COLUMNS.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b); // both unseen
    if (ai === -1) return 1; // a unseen -> after
    if (bi === -1) return -1; // b unseen -> after
    return ai - bi;
  };
  return grouped ? [...ordered].sort(byColumn) : ordered;
}

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s === "done" || s === "completed") return "text-green-300";
  if (s === "running") return "text-blue-300";
  if (s === "blocked") return "text-red-300";
  if (s === "failed" || s === "error") return "text-red-400";
  if (s === "todo") return "text-zinc-400";
  return "text-zinc-300";
}

function formatDateTime(stamp: string): string {
  const match = stamp.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!match) return stamp;
  return `${match[2] ?? "—"} · ${match[1]}`;
}

// Task detail dialog: tries /api/kanban/:id; if the call fails or no detail
// is returned, it shows only the board summary. No hard-block.
function TaskDetailDialog({ task, onClose }: { task: KanbanTask; onClose: () => void }) {
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [detail, setDetail] = useState<KanbanTask | null>(null);

  useEffect(() => {
    let active = true;
    setDetailStatus("loading");
    fetch(`/api/kanban/${encodeURIComponent(task.id)}?board=${encodeURIComponent(task.board ?? "")}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(
        (json) => {
          if (!active) return;
          setDetail((json?.data as KanbanTask) ?? null);
          setDetailStatus("ready");
        },
        () => {
          if (active) setDetailStatus("failed");
        },
      );
    return () => {
      active = false;
    };
  }, [task.id, task.board]);

  return (
    <dialog open className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-2xl w-full rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-100 p-6">
        <header className="flex justify-between items-start">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              KANBAN TASK{task.board ? ` · ${task.board.toUpperCase()} BOARD` : ""} · {task.id}
            </p>
            <h2 className="text-xl font-semibold mt-1">{detail?.title ?? task.title}</h2>
          </div>
          <button
            type="button"
            aria-label={`Close details for ${task.title}`}
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200"
          >
            ✕
          </button>
        </header>
        <div className="mt-3 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex rounded border px-2 py-0.5 text-xs font-medium",
              statusTone(detail?.status ?? task.status),
            )}
          >
            {detail?.status ?? task.status}
          </span>
          <span className="inline-flex rounded border border-zinc-700 px-2 py-0.5 text-xs">
            {detail?.assignee ?? task.assignee ?? UNASSIGNED}
          </span>
          {(detail?.priority ?? task.priority) ? (
            <span className="inline-flex rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
              P{(detail?.priority ?? task.priority) ?? 0}
            </span>
          ) : null}
        </div>
        {detailStatus === "loading" && <p className="mt-3 text-sm text-zinc-400">Memuat detail task…</p>}
        {detailStatus === "failed" && (
          <p className="mt-3 text-sm text-amber-200">
            Full details are not available right now. Showing the board summary.
          </p>
        )}
        <footer className="mt-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </footer>
      </div>
    </dialog>
  );
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="border-zinc-800">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default function Kanban() {
  const { status: src, data: envelope, error, fetchedAt, reload } = useSource<KanbanEnvelope>(
    "/api/kanban",
    10_000,
  );

  // `envelope` here IS the backend envelope: { status, data: payload|null, error? }.
  const payload = envelope?.data ?? undefined;
  const availability: "ok" | "unavailable" | "error" =
    src === "failed"
      ? "error"
      : envelope?.status === "unavailable"
        ? "unavailable"
        : envelope?.status === "error"
          ? "error"
          : "ok";
  const tasks = payload?.tasks ?? [];
  const boards = payload?.boards ?? [];
  const failedBoards = payload?.failedBoards;
  const multiBoard = boards.length > 1;

  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [board, setBoard] = useState("all");
  const [openTask, setOpenTask] = useState<KanbanTask | undefined>();

  const needle = query.trim().toLowerCase();
  const assignees = [...new Set(tasks.map((t) => t.assignee ?? UNASSIGNED))].sort();
  const visible = tasks.filter(
    (t) =>
      (assignee === "all" || (t.assignee ?? UNASSIGNED) === assignee) &&
      (board === "all" || t.board === board) &&
      (!needle || `${t.title} ${t.id} ${t.assignee ?? ""}`.toLowerCase().includes(needle)),
  );
  const columns = orderedStatuses(tasks.map((t) => t.status), true);

  return (
    <Layout
      eyebrow="HERMES KANBAN"
      title="Task board"
      description="Live, read-only view of hermes kanban list across every Kanban board. Columns follow the Hermes board order; the board refreshes every 10 seconds."
      actions={<Button variant="secondary" onClick={reload}>Muat ulang</Button>}
    >
      <p className="text-xs text-zinc-500" role="status">
        {fetchedAt ? `Diperbarui ${formatDateTime(fetchedAt)}` : "Menunggu pembacaan…"}
      </p>

      {(src === "idle" || src === "loading") && (
        <p className="text-sm text-zinc-400" role="status">Memuat kanban task…</p>
      )}

      {availability === "error" && (
        <Card className="border-red-500/40">
          <CardHeader>
            <CardTitle>Gagal memuat kanban</CardTitle>
            <CardDescription>
              {error ?? envelope?.error ?? "Terjadi kesalahan saat menghubungi backend."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" size="sm" onClick={reload}>
              Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {availability === "unavailable" && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle>CLI Hermes tidak tersedia</CardTitle>
            <CardDescription>
              {envelope?.error ?? "Source kanban tidak bisa dibaca. Task mungkin tidak bisa dimuat sekarang."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" size="sm" onClick={reload}>
              Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {availability === "ok" && (
        <>
          {failedBoards && (
            <p className="text-sm text-amber-200">
              Could not read the {failedBoards.join(", ")} board{failedBoards.length === 1 ? "" : "s"}; showing the others.
            </p>
          )}

          {tasks.length === 0 && (
            <EmptyState title="No tasks">
              Hermes returned an empty Kanban task list. Create one with <code className="text-zinc-300">hermes kanban create</code>.
            </EmptyState>
          )}

          {tasks.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                <input
                  type="search"
                  placeholder="Search tasks (title / id / assignee)…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 min-w-48 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                />
                <label className="flex items-center gap-1.5">
                  Agen
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                  >
                    <option value="all">All ({tasks.length})</option>
                    {assignees.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                {multiBoard && (
                  <label className="flex items-center gap-1.5">
                    Board
                    <select
                      value={board}
                      onChange={(e) => setBoard(e.target.value)}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                    >
                      <option value="all">All boards</option>
                      {boards.map((item) => (
                        <option key={item.slug} value={item.slug}>
                          {item.name}
                          {item.current ? " (current)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <span className="ml-auto font-medium text-zinc-200">{visible.length} shown</span>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2">
                {columns.map((statusName) => (
                  <div key={statusName} aria-label={`${statusName} column`} className="flex min-w-64 flex-col">
                    <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5">
                      <span className={cn("text-xs font-medium uppercase", statusTone(statusName))}>
                        {statusName}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {visible.filter((t) => t.status === statusName).length}
                      </span>
                    </div>
                    <div className="mt-1 space-y-1.5">
                      {visible.filter((t) => t.status === statusName).length === 0 ? (
                        <p className="text-xs text-zinc-600">—</p>
                      ) : (
                        visible
                          .filter((t) => t.status === statusName)
                          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
                          .map((task) => (
                            <button
                              key={`${task.board ?? ""}-${task.status}-${task.id}`}
                              type="button"
                              aria-label={`${task.title}. ${task.status}. Buka detail task.`}
                              onClick={() => setOpenTask(task)}
                              className="block w-full text-left rounded-md border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-700"
                            >
                              <strong className="block text-sm font-medium text-zinc-100">{task.title}</strong>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                                <small className="text-zinc-500">{task.id}</small>
                                {multiBoard && task.board && (
                                  <span className="rounded border border-zinc-700 px-1.5 py-px text-zinc-300">
                                    {task.board}
                                  </span>
                                )}
                                <span
                                  className={`rounded border border-zinc-700 px-1.5 py-px ${
                                    task.assignee ? "text-zinc-200" : "text-zinc-500"
                                  }`}
                                >
                                  {task.assignee ?? UNASSIGNED}
                                </span>
                                {task.priority ? (
                                  <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-amber-300">
                                    P{task.priority}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {openTask && <TaskDetailDialog task={openTask} onClose={() => setOpenTask(undefined)} />}
    </Layout>
  );
}
