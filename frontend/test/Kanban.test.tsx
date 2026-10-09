// @vitest-environment jsdom
// R7c — Kanban page (R7c deliverable) unit tests.
//
// Contract from kanban.tsx:
//   - renders columns derived from a TaskBoardSnapshot-like envelope
//   - count badges per column equal visible tasks
//   - search narrows visible count
//   - empty board -> "No tasks" empty state
//   - envelope status error / fetch failed -> error card with reload button
//   - boards.length > 1 -> multi-board selector appears
//   - availability "unavailable" -> CLI unavailable card

import { describe, it, expect, vi, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOM from "react-dom/client";
import Kanban from "../src/pages/Kanban";
import type { KanbanTask, KanbanBoard, KanbanEnvelope } from "../src/pages/Kanban";

// --- minimal DOM assertions (no jest-dom; no new deps allowed) ---

function hasText(el: Element, needle: string): boolean {
  return (el.textContent ?? "").includes(needle);
}
function expectHasText(el: Element, needle: string) {
  expect(hasText(el, needle), `expected text "${needle}"`).toBe(true);
}
function expectNoText(el: Element, needle: string) {
  expect(hasText(el, needle), `expected absence of "${needle}"`).toBe(false);
}

interface Fixture {
  tasks: KanbanTask[];
  boards: KanbanBoard[];
  status?: "ok" | "unavailable" | "error";
  error?: string;
}

function mockEnv(env: Fixture): () => Promise<Response> {
  const envelope: KanbanEnvelope = {
    status: env.status ?? "ok",
    data: { tasks: env.tasks, boards: env.boards },
    error: env.error ?? null,
  };
  return vi.fn(() => Promise.resolve({ ok: true, json: async () => envelope } as Response));
}

async function mountKanban(fetchFn: () => Promise<Response>) {
  const container = document.createElement("div");
  vi.stubGlobal("fetch", fetchFn);
  const root = ReactDOM.createRoot(container);
  act(() => {
    root.render(React.createElement(Kanban));
  });
  await act(() => new Promise((r) => setTimeout(r, 100)));
  return { fetchMock: fetchFn, container, unmount: () => act(() => root.unmount()) };
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
});

describe("Kanban page (R7c)", () => {
  it("renders columns from a TaskBoardSnapshot-like envelope + count badges match", async () => {
    const tasks: KanbanTask[] = [
      { id: "t_1", title: "Fix auth", status: "todo", assignee: "sanji", priority: 2 },
      { id: "t_2", title: "Shard db", status: "running", assignee: "usopp", priority: 1 },
      { id: "t_3", title: "Ship", status: "done", assignee: null, priority: 3 },
    ];
    const { container, unmount } = await mountKanban(mockEnv({ tasks }));

    expect(container).toBeDefined();
    // Counters: 1 todo / 1 running / 1 done
    expectHasText(container, "todo");
    expectHasText(container, "running");
    expectHasText(container, "done");
    expectHasText(container, "Fix auth");

    // Count badges: each of the 3 columns shows exactly 1.
    const columns = container.querySelectorAll('[aria-label$=" column"]');
    expect(columns.length).toBe(3);
    const badges = [...columns].map((col) => {
      const badge = col.querySelector(".text-xs.text-zinc-500");
      return badge?.textContent?.trim();
    });
    expect(badges).toEqual(["1", "1", "1"]);
    expectHasText(container, "3 shown");
    unmount();
  });

  it("search filter narrows visible count to the needle", async () => {
    const tasks: KanbanTask[] = [
      { id: "t_1", title: "Fix login", status: "todo", assignee: "sanji", priority: 2 },
      { id: "t_2", title: "Fix billing", status: "blocked", assignee: "zoro", priority: 2 },
      { id: "t_3", title: "Ship kanban", status: "done", assignee: null, priority: 1 },
    ];
    const { container, unmount } = await mountKanban(mockEnv({ tasks }));

    const search = container.querySelector('input[type="search"]');
    expect(search).not.toBeNull();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(() => {
      setValue.call(search, "billing");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expectNoText(container, "Fix login");
    expectHasText(container, "1 shown");
    unmount();
  });

  it("empty board renders the empty state text", async () => {
    const { container, unmount } = await mountKanban(mockEnv({ tasks: [], boards: [] }));

    expectHasText(container, "No tasks");
    expectHasText(container, "Hermes returned an empty Kanban task list");
    unmount();
  });

  it("status:\"error\" envelope shows error card with reload button", async () => {
    const { container, unmount } = await mountKanban(
      mockEnv({ tasks: [], boards: [], status: "error", error: "db gone" })
    );

    await act(() => new Promise((r) => setTimeout(r, 50)));
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expectHasText(container, "Gagal memuat kanban");
    expectHasText(container, "db gone");
    expectNoText(container, "No tasks");
    const retry = [...container.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Coba lagi")
    );
    expect(retry).toBeDefined();
    unmount();
  });

  it("fetch failure (HTTP error) shows error card with reload button", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({ ok: false, status: 500, json: async () => null } as Response)
    );
    const container = document.createElement("div");
    const root = ReactDOM.createRoot(container);
    act(() => {
      root.render(React.createElement(Kanban));
    });
    await act(() => new Promise((r) => setTimeout(r, 50)));

    expectHasText(container, "Gagal memuat kanban");
    expectHasText(container, "HTTP 500");
    const retry = [...container.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Coba lagi")
    );
    expect(retry).toBeDefined();
    act(() => root.unmount());
  });

  it("unavailable envelope shows CLI unavailable card", async () => {
    const { container, unmount } = await mountKanban(
      mockEnv({ tasks: [], boards: [], status: "unavailable", error: "hermes missing" })
    );

    await act(() => new Promise((r) => setTimeout(r, 50)));
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expectHasText(container, "CLI Hermes tidak tersedia");
    expectHasText(container, "hermes missing");
    unmount();
  });

  it("multi-board selector appears when boards.length > 1", async () => {
    const tasks: KanbanTask[] = [{ id: "t_1", title: "A", status: "todo", board: "alpha" }];
    const { container, unmount } = await mountKanban(mockEnv({ tasks, boards: [{ slug: "alpha", name: "Alpha", current: true, total: 1 }, { slug: "beta", name: "Beta", current: false, total: 0 }] }));

    expectHasText(container, "All boards");
    expectHasText(container, "Alpha");
    expectHasText(container, "current");
    expectHasText(container, "Beta");
    unmount();
  });

  it("board selector hidden when only one board", async () => {
    const tasks: KanbanTask[] = [{ id: "t_1", title: "A", status: "todo", board: "alpha" }];
    const { container, unmount } = await mountKanban(
      mockEnv({ tasks, boards: [{ slug: "alpha", name: "Alpha", current: true, total: 1 }] })
    );

    expectNoText(container, "All boards");
    unmount();
  });

  it("assignee filter dropdown lists all assignees + all option", async () => {
    const tasks: KanbanTask[] = [
      { id: "t_1", title: "A", status: "todo", assignee: "sanji" },
      { id: "t_2", title: "B", status: "todo", assignee: "sanji" },
      { id: "t_3", title: "C", status: "todo" },
    ];
    const { container, unmount } = await mountKanban(mockEnv({ tasks, boards: [] }));

    const select = container.querySelector<HTMLSelectElement>("select");
    expect(select).not.toBeNull();
    expect(select!.value).toBe("all");
    expectHasText(container, "All (3)");
    expectHasText(container, "sanji");
    expectHasText(container, "(unassigned)");
    unmount();
  });

  it("clicking a task card opens the detail dialog", async () => {
    const tasks: KanbanTask[] = [
      { id: "t_1", title: "Fix auth", status: "todo", assignee: "sanji", priority: 2 },
    ];
    const { container, unmount } = await mountKanban(mockEnv({ tasks, boards: [] }));

    const card = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Fix auth"]'
    );
    expect(card).not.toBeNull();
    await act(() => {
      card!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Dialog header carries the task title and status.
    const dialog = container.querySelector("dialog");
    expect(dialog).not.toBeNull();
    expectHasText(container, "t_1");
    expectHasText(container, "todo");
    unmount();
  });

  it("detail dialog closes via its close control", async () => {
    const tasks: KanbanTask[] = [
      { id: "t_9", title: "Closeable", status: "running", assignee: null },
    ];
    const { container, unmount } = await mountKanban(mockEnv({ tasks, boards: [] }));

    const card = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Closeable"]'
    );
    await act(() => {
      card!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("dialog")).not.toBeNull();

    const close = [...container.querySelector("dialog")!.querySelectorAll("button")].find(
      (b) => /close|tutup|×/i.test((b.getAttribute("aria-label") ?? "") + (b.textContent ?? ""))
    );
    expect(close).toBeDefined();
    await act(() => {
      close!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("dialog")).toBeNull();
    unmount();
  });
});
