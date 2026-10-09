// @vitest-environment node
// R7f smoke test — routing helper (pure logic, no React/dom).

import { describe, it, expect } from "vitest";
import { pageFromHash, pageSlug, navigation, HOME, type Page } from "../src/lib/routes";

describe("pageFromHash", () => {
  it('maps "#/kanban" -> "kanban"', () => {
    expect(pageFromHash("#/kanban")).toBe("kanban");
  });

  it('strips query string and leading slash', () => {
    expect(pageFromHash("#/memory?x=1")).toBe("memory");
  });

  it("unknown hash -> office (HOME)", () => {
    expect(pageFromHash("#/nope")).toBe("office");
  });

  it("empty / no hash -> office (HOME)", () => {
    expect(pageFromHash("")).toBe(HOME);
  });

  it("string matching a page name resolves to it (no # needed, no leading /)", () => {
    expect(pageFromHash("kanban")).toBe("kanban");
    expect(pageFromHash("/memory")).toBe("memory");
  });

  it("undefined resolves to HOME (never throws)", () => {
    expect(pageFromHash(undefined as unknown as string)).toBe(HOME);
  });

  it.each(navigation as Page[])("every navigable page round-trips via its hash", (page) => {
    expect(pageFromHash(`#/${page}`)).toBe(page);
  });
});

describe("pageSlug", () => {
  it('collapses whitespace to hyphens and lowercases ("Task Board" -> "task-board")', () => {
    expect(pageSlug("Task Board" as never as Page)).toBe("task-board");
  });

  it("round-trips: pageSlug(page) is recognized back by pageFromHash", () => {
    for (const page of navigation) {
      const slug = pageSlug(page);
      expect(pageFromHash(`#/${slug}`)).toBe(page);
    }
  });
});
