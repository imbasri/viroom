// @vitest-environment jsdom
//
// DI mock pattern (Run param) — the vitest test suite exercises viroom's
// collectors by injecting a fake `Run` callback instead of shelling out.
// Same principle as the ruang reference suite: test collector *behavior*,
// not child-process plumbing.

import { describe, it, expect, vi } from "vitest";

type Run = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

// Collector mirrors `readInsights`'s contract but accepts a `Run` param so
// unit tests can assert exact command arguments and inject failure modes.
async function collectInsights(profile: string, days: number, run: Run) {
  // Guard against option-like profile names before they reach the CLI.
  if (/^--/.test(profile)) {
    return {
      availability: "error" as const,
      data: null,
      error: `invalid profile name: ${profile}`,
    };
  }
  const r = await run("hermes", ["-p", profile, "insights", "--days", String(days), "--json"]);
  if (r.exitCode !== 0) {
    return {
      availability: "unavailable" as const,
      data: null,
      error: r.stderr.trim() || `hermes insights unavailable (${profile})`,
    };
  }
  let parsed: { sessions?: number; total?: number } = {};
  try {
    parsed = JSON.parse(r.stdout) as typeof parsed;
  } catch {
    return { availability: "error" as const, data: null, error: "could not parse insights report" };
  }
  return {
    availability: "ok" as const,
    data: { profile, days, sessions: parsed.sessions ?? 0, total: parsed.total ?? 0 },
    error: null,
  };
}

describe("DI mock pattern (Run param)", () => {
  it("asserts the exact hermes CLI arguments are forwarded", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const run: Run = async (file, args) => {
      calls.push({ file, args });
      return { stdout: JSON.stringify({ sessions: 7, total: 42 }), stderr: "", exitCode: 0 };
    };

    const res = await collectInsights("research", 7, run);

    expect(res.availability).toBe("ok");
    expect(res.data).toEqual({ profile: "research", days: 7, sessions: 7, total: 42 });
    // Regressive guard: only one command, no redundant per-profile gateway call.
    expect(calls).toEqual([
      { file: "hermes", args: ["-p", "research", "insights", "--days", "7", "--json"] },
    ]);
  });

  it("maps a non-zero exit to structured unavailable without throwing", async () => {
    const run: Run = async () => ({ stdout: "", stderr: "no such profile", exitCode: 3 });
    const res = await collectInsights("ghost", 1, run);
    expect(res.availability).toBe("unavailable");
    expect(res.data).toBeNull();
    expect(res.error).toBe("no such profile");
  });

  it("rejects option-like profile names before they reach the CLI", async () => {
    let invoked = false;
    const run: Run = async () => {
      invoked = true;
      return { stdout: "{}", stderr: "", exitCode: 0 };
    };
    const res = await collectInsights("--evil", 7, run);
    expect(res.availability).toBe("error");
    expect(res.error).toContain("--evil");
    expect(invoked).toBe(false); // CLI never called.
  });

  it("maps unparseable stdout to a structured error, not a crash", async () => {
    const run: Run = async () => ({ stdout: "Hermes profile service is starting.", stderr: "", exitCode: 0 });
    const res = await collectInsights("default", 7, run);
    expect(res.availability).toBe("error");
    expect(res.data).toBeNull();
  });

  it("supports a vi.fn() spy for asserting call counts", async () => {
    const spy = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ sessions: 1, total: 1 }),
      stderr: "",
      exitCode: 0,
    });
    await collectInsights("default", 30, spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("hermes", ["-p", "default", "insights", "--days", "30", "--json"]);
  });
});
