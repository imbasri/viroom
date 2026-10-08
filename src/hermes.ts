// Hermes CLI adapter — READ-ONLY terhadap `hermes` CLI.
// Pola: Source<T> wrapper (availability/data/error), systemRun via execFile,
// cache 10s + in-flight dedup, PROFILE_NAME/BOARD_SLUG regex guard.
//
// Binary dapat dikonfigurasi via HERMITES_BIN (default: "hermes"). READ-ONLY:
// semua perintah hanya memanggil sub-command yang tidak memutasi state.

import { execFile } from "node:child_process";

/** Status ketersediaan sebuah sumber data. */
export type Availability = "ok" | "unavailable" | "error";

/** Wrapper seragam untuk tiap sumber dashboard. */
export interface Source<T> {
  availability: Availability;
  data: T | null;
  error: string | null;
}

export const sourceOk = <T>(data: T): Source<T> => ({ availability: "ok", data, error: null });
export const sourceUnavailable = <T>(error: string): Source<T> => ({
  availability: "unavailable",
  data: null,
  error,
});
export const sourceError = <T>(error: string): Source<T> => ({ availability: "error", data: null, error });

const PROFILE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const BOARD_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function assertProfileName(v: string): void {
  if (!PROFILE_NAME_RE.test(v)) throw new Error(`invalid profile name: ${v}`);
}

export function assertBoardSlug(v: string): void {
  if (!BOARD_SLUG_RE.test(v)) throw new Error(`invalid board slug: ${v}`);
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

const RUN_TIMEOUT_MS = 8000;

// Binary CLI yang dipanggil. Default "hermes"; dapat di-override via env
// (mis. HERMITES_BIN=hermes-agent) agar testable tanpa binary asli.
// Dibaca per-panggilan (bukan saat module load) agar test bisa override.
export const HERMES_BIN = () => process.env.HERMITES_BIN ?? "hermes";

export function systemRun(file: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      {
        timeout: RUN_TIMEOUT_MS,
        maxBuffer: 512 * 1024,
        env: { ...process.env, NO_COLOR: "1", COLUMNS: "200" },
      },
      (err, stdout, stderr) => {
        resolve({
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
          exitCode: typeof err?.code === "number" ? err.code : err ? 1 : 0,
          timedOut: Boolean((err as { killed?: boolean } | null)?.killed),
        });
      },
    );
    void child;
  });
}

// Cache 10s + in-flight dedup per command key.
const CACHE_TTL_MS = 10_000;
const cache = new Map<string, { at: number; value: RunResult }>();
const inflight = new Map<string, Promise<RunResult>>();

const cmdKey = (args: string[]): string => JSON.stringify(args);

export function hermesRun(args: string[]): Promise<RunResult> {
  const key = cmdKey(args);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.value);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = systemRun(HERMES_BIN(), args).then((r) => {
    cache.set(key, { at: Date.now(), value: r });
    inflight.delete(key);
    return r;
  });
  inflight.set(key, p);
  return p;
}

export function clearHermesCache(): void {
  cache.clear();
  inflight.clear();
}

// --- Parsers (best-effort, tidak pernah throw) ---

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

export function parseBoardsList(stdout: string): string[] {
  const j = safeJson(stdout);
  if (Array.isArray(j)) {
    return j.map((b) => String((b as { slug?: unknown }).slug ?? b)).filter(Boolean);
  }
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => BOARD_SLUG_RE.test(l));
}

export function parseProfilesList(stdout: string): string[] {
  const j = safeJson(stdout);
  if (Array.isArray(j)) {
    return j.map((p) => String((p as { name?: unknown }).name ?? p)).filter(Boolean);
  }
  return stdout
    .split("\n")
    .map((l) => l.trim().replace(/^\*\s*/, ""))
    .filter((l) => PROFILE_NAME_RE.test(l));
}

// --- Insights (R4: token usage per agen) ---

export interface InsightsSummary {
  profile: string;
  days: number;
  empty: boolean;
  totals: {
    sessions: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    toolCalls: number;
    costUsd: number;
  };
  models: Array<{
    model: string;
    sessions: number;
    totalTokens: number;
    toolCalls: number;
    cost: number;
  }>;
  topTools: Array<{ tool: string; calls: number; pct: number }>;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Normalize a raw `hermes insights` report (JSON if `--json` is available,
// else the terminal/gateway text — best-effort, never throws).
export function parseInsightsReport(
  stdout: string,
  profile: string,
  days: number,
): InsightsSummary | null {
  const j = safeJson(stdout);
  if (j && typeof j === "object") {
    const o = j as Record<string, unknown>;
    const ov = (o.overview ?? {}) as Record<string, unknown>;
    const models = Array.isArray(o.models)
      ? (o.models as Record<string, unknown>[]).map((m) => ({
          model: String(m.model ?? "unknown"),
          sessions: num(m.sessions),
          totalTokens: num(m.total_tokens ?? m.tokens),
          toolCalls: num(m.tool_calls),
          cost: num(m.cost),
        }))
      : [];
    const tools = Array.isArray(o.tools)
      ? (o.tools as Record<string, unknown>[]).map((t) => ({
          tool: String(t.tool ?? t.name ?? "unknown"),
          calls: num(t.calls ?? t.count),
          pct: num(t.pct ?? t.pct_of_total ?? 0),
        }))
      : [];
    return {
      profile,
      days,
      empty: Boolean(o.empty),
      totals: {
        sessions: num(ov.total_sessions ?? models.reduce((a, m) => a + m.sessions, 0)),
        inputTokens: num(ov.total_input_tokens),
        outputTokens: num(ov.total_output_tokens),
        totalTokens: num(ov.total_tokens),
        toolCalls: num(ov.total_tool_calls),
        costUsd: num(ov.total_cost ?? ov.cost ?? models.reduce((a, m) => a + m.cost, 0)),
      },
      models,
      topTools: tools,
    };
  }
  // Fallback: terminal-formatted report — pull the headline numbers.
  if (!stdout.trim()) return null;
  const grab = (re: RegExp): number => {
    const m = stdout.match(re);
    return m ? num(m[1].replace(/,/g, "")) : 0;
  };
  const sessions = grab(/Sessions:\s*([\d,]+)/i);
  const inputTokens = grab(/Input tokens:\s*([\d,]+)/i);
  const outputTokens = grab(/Output tokens:\s*([\d,]+)/i);
  const totalTokens = grab(/Total tokens:\s*([\d,]+)/i);
  const toolCalls = grab(/Tool calls:\s*([\d,]+)/i);
  return {
    profile,
    days,
    empty: /No sessions found/i.test(stdout),
    totals: {
      sessions,
      inputTokens,
      outputTokens,
      totalTokens: totalTokens || inputTokens + outputTokens,
      toolCalls,
      costUsd: 0,
    },
    models: [],
    topTools: [],
  };
}

export async function readInsights(
  profile: string,
  days: number,
): Promise<Source<InsightsSummary>> {
  try {
    assertProfileName(profile);
  } catch (e) {
    return sourceError(e instanceof Error ? e.message : String(e));
  }
  try {
    const r = await hermesRun(["-p", profile, "insights", "--days", String(days), "--json"]);
    if (r.exitCode !== 0) return sourceUnavailable(r.stderr.trim() || `hermes insights unavailable (${profile})`);
    const parsed = parseInsightsReport(r.stdout, profile, days);
    if (!parsed) return sourceError("could not parse insights report");
    return sourceOk(parsed);
  } catch (e) {
    return sourceError(e instanceof Error ? e.message : String(e));
  }
}

// Fan out to every profile in parallel and merge into a single aggregate.
export async function readAllInsights(
  days: number,
): Promise<Source<{ profiles: string[]; aggregate: InsightsSummary; unavailable: string[] }>> {
  const rt = await readRuntime();
  if (rt.availability !== "ok" || !rt.data) {
    return sourceError(rt.error ?? "runtime unavailable");
  }
  const profiles = rt.data.profiles.length ? rt.data.profiles : ["default"];
  const results = await Promise.all(profiles.map((p) => readInsights(p, days)));
  const unavailable = results
    .map((r, i) => (r.availability === "ok" ? null : profiles[i]))
    .filter((x): x is string => x !== null);

  const agg: InsightsSummary = {
    profile: "all",
    days,
    empty: true,
    totals: { sessions: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, toolCalls: 0, costUsd: 0 },
    models: [],
    topTools: [],
  };
  const modelMap = new Map<string, InsightsSummary["models"][number]>();
  const toolMap = new Map<string, InsightsSummary["topTools"][number]>();
  let anyData = false;
  for (const r of results) {
    if (r.availability !== "ok" || !r.data) continue;
    anyData = true;
    const d = r.data;
    agg.totals.sessions += d.totals.sessions;
    agg.totals.inputTokens += d.totals.inputTokens;
    agg.totals.outputTokens += d.totals.outputTokens;
    agg.totals.totalTokens += d.totals.totalTokens;
    agg.totals.toolCalls += d.totals.toolCalls;
    agg.totals.costUsd += d.totals.costUsd;
    for (const m of d.models) {
      const e = modelMap.get(m.model) ?? { model: m.model, sessions: 0, totalTokens: 0, toolCalls: 0, cost: 0 };
      e.sessions += m.sessions; e.totalTokens += m.totalTokens;
      e.toolCalls += m.toolCalls; e.cost += m.cost;
      modelMap.set(m.model, e);
    }
    for (const t of d.topTools) {
      const e = toolMap.get(t.tool) ?? { tool: t.tool, calls: 0, pct: 0 };
      e.calls += t.calls;
      toolMap.set(t.tool, e);
    }
  }
  agg.empty = !anyData;
  agg.models = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  const totalCalls = agg.totals.toolCalls || [...toolMap.values()].reduce((a, t) => a + t.calls, 0);
  agg.topTools = [...toolMap.values()]
    .map((t) => ({ ...t, pct: totalCalls ? Math.round((t.calls / totalCalls) * 100) : 0 }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10);

  return sourceOk({
    profiles,
    aggregate: agg,
    unavailable,
  });
}

export async function readHealth(): Promise<Source<{ cli: boolean }>> {
  try {
    const r = await hermesRun(["--version"]);
    if (r.exitCode !== 0) return sourceUnavailable(r.stderr.trim() || "hermes CLI unavailable");
    return sourceOk({ cli: true });
  } catch (e) {
    return sourceError(e instanceof Error ? e.message : String(e));
  }
}

export async function readRuntime(): Promise<Source<{ boards: string[]; profiles: string[] }>> {
  try {
    const [b, p] = await Promise.all([
      hermesRun(["kanban", "boards", "list", "--json"]),
      hermesRun(["profile", "list"]),
    ]);
    if (b.exitCode !== 0 && p.exitCode !== 0) {
      return sourceUnavailable((b.stderr || p.stderr).trim() || "hermes CLI unavailable");
    }
    return sourceOk({
      boards: b.exitCode === 0 ? parseBoardsList(b.stdout) : [],
      profiles: p.exitCode === 0 ? parseProfilesList(p.stdout) : [],
    });
  } catch (e) {
    return sourceError(e instanceof Error ? e.message : String(e));
  }
}

export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
}

export async function readTasks(board: string): Promise<Source<TaskSummary[]>> {
  let b: string;
  try {
    assertBoardSlug(board);
    b = board;
  } catch (e) {
    return sourceError(e instanceof Error ? e.message : String(e));
  }
  try {
    const r = await hermesRun(["kanban", "--board", b, "list", "--json"]);
    if (r.exitCode !== 0) return sourceUnavailable(r.stderr.trim() || `board ${b} unavailable`);
    const j = safeJson(r.stdout);
    if (!Array.isArray(j)) return sourceOk([]);
    return sourceOk(
      j.map((t) => {
        const o = t as Record<string, unknown>;
        return {
          id: String(o.id ?? ""),
          title: String(o.title ?? ""),
          status: String(o.status ?? ""),
          assignee: o.assignee == null ? null : String(o.assignee),
        };
      }),
    );
  } catch (e) {
    return sourceError(e instanceof Error ? e.message : String(e));
  }
}
