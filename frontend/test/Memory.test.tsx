// @vitest-environment jsdom
// R7d — Memory page unit tests.
//
// Contract from memory.tsx:
//   - renders agent tabs from a MemorySnapshot-like envelope
//   - locked:true agent -> lock UI, no content
//   - available:false -> reason text
//   - usage bar width === percent
//   - >=80% -> redaction warning
//   - entries filter via search needle

import { describe, it, expect, vi, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOM from "react-dom/client";
import { Memory } from "../src/pages/Memory";
import type {
  AgentMemory,
  MemoryEnvelope,
  MemoryStore,
} from "../src/pages/Memory";

/**
 * Minimal DOM assertions without a jest-dom extension.
 * (No new dependencies allowed per R7f out-of-scope clause.)
 */
function hasText(el: Element, needle: string): boolean {
  return (el.textContent ?? "").includes(needle);
}

function expectHasText(el: Element, needle: string) {
  expect(hasText(el, needle), `expected text "${needle}" in container`).toBe(true);
}

function expectNoText(el: Element, needle: string) {
  expect(hasText(el, needle), `expected absence of text "${needle}"`).toBe(false);
}

function env(agents: AgentMemory[], status: "ok" | "unavailable" | "error" = "ok", error?: string): () => Promise<Response> {
  const envelope: MemoryEnvelope = {
    status,
    data: status === "ok" ? { agents } : null,
    error,
  };
  return vi.fn(() =>
    Promise.resolve({ ok: true, json: async () => envelope } as Response)
  );
}

function memoryStore(name: string, used: number, limit: number, entries: string[]): MemoryStore {
  return {
    name,
    path: `/mem/${name}`,
    exists: true,
    chars: used,
    modified: "2026-10-09T03:00:00Z",
    content: used > 0 ? "x" : undefined,
    entries,
    limit,
    used,
    percent: Math.round((used / limit) * 100),
  };
}

async function mountMemory(fetchFn: () => Promise<Response>) {
  const container = document.createElement("div");
  vi.stubGlobal("fetch", fetchFn);
  const root = ReactDOM.createRoot(container);
  act(() => {
    root.render(React.createElement(Memory));
  });
  await act(() => new Promise((r) => setTimeout(r, 100)));
  return { fetchMock: fetchFn, container, unmount: () => act(() => root.unmount()) };
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
});

describe("Memory page (R7d)", () => {
  it("renders agent tabs from the snapshot", async () => {
    const agents: AgentMemory[] = [
      {
        profile: "default",
        label: "Default",
        path: "~/profile/default",
        kind: "hermes",
        available: true,
        memory: memoryStore("MEMORY.md", 500, 1000, []),
        user: memoryStore("USER.md", 100, 1000, []),
        contextFiles: [],
      },
      {
        profile: "opencode",
        label: "OpenCode",
        path: "~",
        kind: "opencode",
        available: true,
        contextFiles: [],
      },
    ];
    const { container, unmount } = await mountMemory(env(agents));

    expectHasText(container, "Default");
    expectHasText(container, "OpenCode");
    unmount();
  });

  it("locked:true agent shows lock UI, not content", async () => {
    const agents: AgentMemory[] = [
      {
        profile: "secret",
        label: "Secret",
        path: "~/profile/secret",
        kind: "hermes",
        available: true,
        locked: true,
        memory: memoryStore("MEMORY.md", 1, 1000, ["s3cr3t"]),
        user: undefined,
        contextFiles: [],
      },
    ];
    const { container, unmount } = await mountMemory(env(agents));

    expectHasText(container, "terkunci");
    expectNoText(container, "s3cr3t");
    unmount();
  });

  it("available:false agent shows reason text", async () => {
    const agents: AgentMemory[] = [
      {
        profile: "broken",
        label: "Broken",
        path: "~/profile/broken",
        kind: "hermes",
        available: false,
        reason: "profNotFound",
        memory: undefined,
        user: undefined,
        contextFiles: [],
      },
    ];
    const { container, unmount } = await mountMemory(env(agents));

    expectHasText(container, "Profil tidak tersedia");
    expectHasText(container, "profNotFound");
    unmount();
  });

  it("usage bar width === percent", async () => {
    const store = memoryStore("MEMORY.md", 500, 1000, []);
    const agents: AgentMemory[] = [
      {
        profile: "default",
        label: "Default",
        path: "~/profile/default",
        kind: "hermes",
        available: true,
        memory: store,
        user: undefined,
        contextFiles: [],
      },
    ];
    const { container, unmount } = await mountMemory(env(agents));

    const bar = container.querySelector('[aria-label*="Pemakaian"]');
    expect(bar).not.toBeNull();
    expect((bar as HTMLElement).firstElementChild!.getAttribute("style")).toContain("width: 50%");
    expectHasText(container, "50%");
    unmount();
  });

  it(">=80% renders the redaction warning", async () => {
    const store = memoryStore("MEMORY.md", 900, 1000, []);
    const agents: AgentMemory[] = [
      {
        profile: "default",
        label: "Default",
        path: "~/profile/default",
        kind: "hermes",
        available: true,
        memory: store,
        user: undefined,
        contextFiles: [],
      },
    ];
    const { container, unmount } = await mountMemory(env(agents));

    expectHasText(container, "Sudah di atas 80%");
    unmount();
  });

  it("entries filter via search needle narrows the list", async () => {
    const store = memoryStore("MEMORY.md", 500, 1000, ["alpha task", "beta task"]);
    const agents: AgentMemory[] = [
      {
        profile: "default",
        label: "Default",
        path: "~/profile/default",
        kind: "hermes",
        available: true,
        memory: store,
        user: undefined,
        contextFiles: [],
      },
    ];
    const { container, unmount } = await mountMemory(env(agents));

    expectHasText(container, "alpha task");
    expectHasText(container, "beta task");

    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    expect(search).not.toBeNull();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(() => {
      setValue.call(search, "alpha");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expectHasText(container, "alpha task");
    expectNoText(container, "beta task");
    unmount();
  });
});
