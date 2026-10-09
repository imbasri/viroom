// viroom R3 — cron multi-profile + month view tests.
//
// Strategy: fake hermes CLI (test-bin/hermes-fake.sh) + HERMITES_BIN override
// (R1 pattern) so the real adapter code path runs with no hermes binary
// installed. Parser + month-entry tests run on the real module; the live
// endpoint test imports the default Elysia app and listens on a free port.

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { join } from "node:path";
import {
  parseCronJobs,
  monthEntries,
  cronField,
  parseCron,
  dayKey,
  collectCronJobs,
  type ScheduledJob,
} from "../src/cron";
import { clearHermesCache } from "../src/hermes";

interface CronEnvelope {
  status: "ok" | "unavailable" | "error";
  data: {
    jobs: Array<ScheduledJob & { agent?: string }>;
    failedProfiles?: string[];
    fetchedAt: string;
  } | null;
  error?: string;
}

const FAKE_HERMES = join(process.cwd(), "test-bin", "hermes-fake.sh");

async function withHermesEnv(vars: Record<string, string>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  clearHermesCache();
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearHermesCache();
  }
}

function agentJobs(profile: string): ScheduledJob[] {
  return [
    {
      name: "sanji daily-check",
      schedule: "0 8 * * *",
      agent: profile,
      status: "active",
      nextRun: "2026-10-12 08:00:00",
      lastRun: "2026-10-10 08:00:00",
      lastRunOk: true,
    },
  ];
}

describe("parseCronJobs (header + field shape)", () => {
  it("parses multi-job output into ScheduledJob[]", () => {
    const out = [
      " job-01 [active]",
      "   Name: daily-check",
      "   Schedule: 0 8 * * *",
      "   Next run: 2026-10-12 08:00:00",
      "   Last run: 2026-10-10 08:00:00  ok",
      " job-02 [paused]",
      "   Name: backup",
      "   Schedule: every 2d",
      "   Next run: 2026-10-08 09:00:00",
      "   Overdue: 2026-10-08 09:00:00",
      "   Last run: 2026-10-09 09:00:00  failed",
    ].join("\n");
    const jobs = parseCronJobs(out);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      name: "daily-check",
      schedule: "0 8 * * *",
      status: "active",
      nextRun: "2026-10-12 08:00:00",
      lastRun: "2026-10-10 08:00:00",
      lastRunOk: true,
    });
    expect(jobs[1]).toMatchObject({
      name: "backup",
      schedule: "every 2d",
      status: "paused",
      overdue: true,
      lastRunOk: false,
    });
  });

  it("returns [] for 'No scheduled jobs.'", () => {
    expect(parseCronJobs("No scheduled jobs.")).toEqual([]);
  });
});

describe("collectCronJobs (fan-out multi-profile, HERMITES_BIN)", () => {
  beforeEach(() => clearHermesCache());

  it("tags jobs with agent and returns ok", async () => {
    clearHermesCache();
    await withHermesEnv(
      {
        HERMITES_BIN: FAKE_HERMES,
        FAKE_HERMES_PROFILES: "sanji zoro",
      },
      async () => {
        const src = await collectCronJobs();
        expect(src.availability).toBe("ok");
        expect(src.data?.jobs).toHaveLength(4);
        expect(src.data?.jobs.filter((j) => j.agent === "sanji")).toHaveLength(2);
        expect(src.data?.jobs.filter((j) => j.agent === "zoro")).toHaveLength(2);
        expect(src.data?.jobs[0].name).toContain("sanji");
        expect(src.data?.jobs[2].name).toContain("zoro");
      }
    );
  });

  it("returns unavailable when all profiles fail", async () => {
    await withHermesEnv(
      {
        HERMITES_BIN: FAKE_HERMES,
        FAKE_HERMES_PROFILES: "sanji",
        FAKE_HERMES_FAIL_CRON: "1",
      },
      async () => {
        const src = await collectCronJobs();
        expect(src.availability).toBe("unavailable");
        expect(src.data?.failedProfiles).toEqual(["sanji"]);
      }
    );
  });

  it("returns unavailable when hermes binary missing", async () => {
    clearHermesCache();
    await withHermesEnv({ HERMITES_BIN: "/nonexistent/hermes" }, async () => {
      const src = await collectCronJobs();
      expect(src.availability).toBe("unavailable");
      expect(src.data?.jobs).toEqual([]);
    });
  });
});

describe("monthEntries (port ruang cron-calendar.test.ts)", () => {
  const today = "2026-10-10";

  it("daily cron appears on each day starting today", () => {
    const entries = monthEntries(agentJobs("sanji"), 2026, 9, today);
    const runOn = (d: string) => entries.get(d)?.find((e) => e.kind === "run");
    expect(runOn("2026-10-09")).toBeUndefined();
    expect(runOn("2026-10-10")).toMatchObject({
      kind: "run",
      label: "08:00",
      agent: "sanji",
    });
    expect(entries.get("2026-10-31")?.length).toBe(1);
    expect(runOn("2026-10-31")).toMatchObject({ kind: "run", label: "08:00" });
  });

  it("every-2d job appears on every second day from today", () => {
    const jobs: ScheduledJob[] = [
      { name: "every-2d", schedule: "every 2d", agent: "sanji", status: "active" },
    ];
    const entries = monthEntries(jobs, 2026, 9, today);
    expect(entries.get("2026-10-10")).toMatchObject([{ kind: "run" }]);
    expect(entries.get("2026-10-12")).toMatchObject([{ kind: "run" }]);
    expect(entries.get("2026-10-11")).toBeUndefined();
  });

  it("overdue job shows an overdue marker", () => {
    const jobs: ScheduledJob[] = [
      {
        name: "overdue",
        schedule: "0 8 * * *",
        agent: "sanji",
        status: "active",
        nextRun: "2026-10-08 08:00:00",
        overdue: true,
      },
    ];
    const entries = monthEntries(jobs, 2026, 9, today);
    expect(entries.get("2026-10-08")).toMatchObject([{ kind: "overdue" }]);
  });

  it("paused job shows a last-failed entry when lastRunOk is false", () => {
    const jobs: ScheduledJob[] = [
      {
        name: "paused",
        schedule: "0 8 * * *",
        agent: "sanji",
        status: "paused",
        lastRun: "2026-10-09 08:00:00",
        lastRunOk: false,
      },
    ];
    const entries = monthEntries(jobs, 2026, 9, today);
    expect(entries.get("2026-10-09")).toMatchObject([{ kind: "last-failed" }]);
  });

  it("high-frequency cron collapses to '96× a day'", () => {
    const jobs: ScheduledJob[] = [
      { name: "frequent", schedule: "*/15 * * * *", agent: "sanji", status: "active" },
    ];
    const entries = monthEntries(jobs, 2026, 9, today);
    expect(entries.get("2026-10-10")?.[0]).toMatchObject({
      kind: "interval",
      label: "96× a day",
    });
  });

  it("cronField / parseCron helpers behave", () => {
    expect(cronField("*/15", 0, 59)).toEqual([0, 15, 30, 45]);
    expect(cronField("60", 0, 59)).toBeUndefined();
    const cron = parseCron("0 8 * * *")!;
    expect(cron.minutes).toEqual([0]);
    expect(cron.hours).toEqual([8]);
    expect(parseCron("60 * * * *")).toBeUndefined();
    expect(dayKey(2026, 9, 5)).toBe("2026-10-05");
  });
});

describe("GET /api/cron (live Elysia app)", () => {
  type ElysiaInstance = typeof import("elysia").default extends new (...args: unknown[]) => infer A ? A : never;
  let app: ElysiaInstance;

  beforeAll(async () => {
    process.env.HERMITES_BIN = FAKE_HERMES;
    process.env.FAKE_HERMES_PROFILES = "sanji zoro";
    clearHermesCache();
    app = (await import("../src/index")).default as ElysiaInstance;
  });

  afterAll(() => {
    delete process.env.HERMITES_BIN;
    delete process.env.FAKE_HERMES_PROFILES;
    clearHermesCache();
  });

  const request = (path: string) =>
    (app as unknown as { handle: (r: Request) => Promise<Response> }).handle(
      new Request(`http://localhost${path}`),
    );

  it("returns ok envelope with agent-tagged jobs", async () => {
    const res = await request("/api/cron");
    expect(res.status).toBe(200);
    const body = (await res.json()) as CronEnvelope;
    expect(body.status).toBe("ok");
    expect(Array.isArray(body.data?.jobs)).toBe(true);
  });

  it("filters by ?agent=", async () => {
    const res = await request("/api/cron?agent=sanji");
    expect(res.status).toBe(200);
    const body = (await res.json()) as CronEnvelope;
    if (body.data) {
      for (const j of body.data.jobs ?? []) {
        expect(j.agent).toBe("sanji");
      }
    }
  });

  it("rejects invalid agent with 400", async () => {
    const res = await request("/api/cron?agent=Bad%2Fslug");
    expect(res.status).toBe(400);
    const body = (await res.json()) as CronEnvelope;
    expect(body.status).toBe("error");
    expect(typeof body.error).toBe("string");
  });
});
