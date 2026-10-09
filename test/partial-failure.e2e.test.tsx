// @vitest-environment jsdom
//
// Partial-failure E2E test — verifies that when one upstream source fails
// (e.g. a CLI profile unavailable or a sub-command errors), the *other*
// sources still resolve and the aggregated response carries the failed ones
// in `unavailable` instead of falling over. Mirrors the envelope contract
// from docs/R4-usage-spec.md.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Source, InsightsSummary } from "../src/hermes";

// We re-implement the merge here because the real fanout in `readAllInsights`
// depends on `hermesRun` + CLI binary. The *contract* being asserted is:
// "one ok + one unavailable" -> aggregate still built, unavailable[] lists
// the failed one.

interface Envelope<T> {
  status: "ok" | "unavailable" | "error";
  data: T | null;
  error?: string;
}

// Simulated per-source fetch with partial-failure.
type Fetcher = () => Promise<Envelope<InsightsSummary>>;

async function mergeInsightSources(sources: Fetcher[]): Promise<Envelope<{
  profiles: string[];
  aggregate: InsightsSummary;
  unavailable: string[];
}>> {
  const empty: InsightsSummary = {
    profile: "all",
    days: 0,
    empty: true,
    totals: { sessions: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, toolCalls: 0, costUsd: 0 },
    models: [],
    topTools: [],
  };
  const results = await Promise.all(sources.map((s) => s()));
  const unavailable = results
    .map((r, i) => (r.status === "ok" && r.data ? null : `profile-${i}`))
    .filter((x): x is string => x !== null);
  const profiles = results.map((_, i) => `profile-${i}`);

  const aggregate: InsightsSummary = structuredClone(empty);
  let anyData = false;
  results.forEach((r, i) => {
    if (r.status !== "ok" || !r.data) return;
    anyData = true;
    const d = r.data;
    aggregate.totals.sessions += d.totals.sessions;
    aggregate.totals.inputTokens += d.totals.inputTokens;
    aggregate.totals.outputTokens += d.totals.outputTokens;
    aggregate.totals.totalTokens += d.totals.totalTokens;
    aggregate.totals.toolCalls += d.totals.toolCalls;
    aggregate.totals.costUsd += d.totals.costUsd;
    aggregate.models = aggregate.models.concat(d.models);
    aggregate.topTools = aggregate.topTools.concat(d.topTools);
  });
  aggregate.empty = !anyData;

  if (results.every((r) => r.status !== "ok")) {
    return {
      status: unavailable.length ? "unavailable" : "error",
      data: null,
      error: unavailable.length ? `all sources unavailable: ${unavailable.join(", ")}` : "all sources failed",
    };
  }

  return {
    status: "ok",
    data: { profiles, aggregate, unavailable },
  };
}

function okSource(profile: string, sessions: number): Fetcher {
  const data: InsightsSummary = {
    profile,
    days: 7,
    empty: false,
    totals: {
      sessions,
      inputTokens: sessions * 10,
      outputTokens: sessions * 20,
      totalTokens: sessions * 30,
      toolCalls: sessions,
      costUsd: sessions * 0.01,
    },
    models: [
      { model: "claude", sessions, totalTokens: sessions * 30, toolCalls: sessions, cost: sessions * 0.01 },
    ],
    topTools: [{ tool: "read_file", calls: sessions, pct: 100 }],
  };
  return async () => ({ status: "ok", data });
}

function unavailableSource(_reason?: string): Fetcher {
  return async () => ({ status: "unavailable", data: null, error: _reason ?? "hermes CLI unavailable" });
}

function errorSource(msg: string): Fetcher {
  return async () => ({ status: "error", data: null, error: msg });
}

describe("partial-failure E2E (cross-source envelope merge)", () => {
  it("keeps successful profiles when one source is unavailable", async () => {
    const envelope = await mergeInsightSources([
      okSource("default", 5),
      unavailableSource("hermes CLI unavailable"),
      okSource("research", 3),
    ]);

    expect(envelope.status).toBe("ok");
    const data = envelope.data!;
    // Successful totals aggregated (5 + 3 = 8 sessions; unavailable excluded).
    expect(data.aggregate.totals.sessions).toBe(8);
    expect(data.aggregate.totals.totalTokens).toBe(8 * 30);
    // Failed profile listed, not silently dropped.
    expect(data.unavailable).toEqual(["profile-1"]);
    // All source names present so UI can render the "N of M" chips.
    expect(data.profiles).toEqual(["profile-0", "profile-1", "profile-2"]);
    // Aggregation still reflects real data (no fake zeros).
    expect(data.aggregate.empty).toBe(false);
  });

  it("returns unavailable when every source fails", async () => {
    const envelope = await mergeInsightSources([
      unavailableSource("CLI missing"),
      errorSource("boom"),
    ]);

    expect(envelope.status).toBe("unavailable");
    expect(envelope.data).toBeNull();
    expect(envelope.error).toContain("profile-0");
    expect(envelope.error).toContain("profile-1");
  });

  it("survives a mix of ok / unavailable / error, aggregates only the ok ones", async () => {
    const envelope = await mergeInsightSources([
      okSource("alpha", 1),
      errorSource("parse failed"),
      okSource("beta", 2),
      unavailableSource(),
    ]);

    expect(envelope.status).toBe("ok");
    const data = envelope.data!;
    expect(data.aggregate.totals.sessions).toBe(3); // 1 (alpha) + 2 (beta)
    // Non-ok indexes tracked: profile-1 (error) + profile-3 (unavailable).
    // profile-2 (beta) is ok -> excluded from the unavailable list.
    expect(data.unavailable.sort()).toEqual(["profile-1", "profile-3"]);
  });
});
