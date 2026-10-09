// viroom cron + calendar month view — parse `hermes cron list --all` per profile,
// fan-out multi-profile, plus month grid util. Port dari ruang (server/mission-control.ts
// parseCronJobs + src/cron-calendar.ts monthEntries). Pola: Source<T> wrapper + hermesRun
// (read-only execFile, cache, regex guard). READ-ONLY terhadap hermes CLI.
//
// Bulan grid pakai `wall-clock` host (cron field baca seperti tertulis, timestamp next/last
// run pakai tanggal+jam tanpa offset), tidak menggeser karena timezone browser.

import type { Source } from "./hermes";
import { hermesRun, readRuntime, assertProfileName } from "./hermes";

// --- types ---
export interface ScheduledJob {
  private?: boolean;
  name: string;
  schedule: string;
  id?: string;
  nextRun?: string;
  overdue?: boolean;
  status?: string;
  repeat?: string;
  lastRun?: string;
  lastRunOk?: boolean;
  /** Hermes profile pemilik job (cron disimpan per profile). */
  agent?: string;
}

export interface CronJobsSnapshot {
  jobs: ScheduledJob[];
  failedProfiles?: string[];
  fetchedAt: string;
}

export type EntryKind = "run" | "interval" | "overdue" | "last-ok" | "last-failed";
export interface CalendarEntry {
  job: string;
  kind: EntryKind;
  label: string;
  agent?: string;
}

// --- text helpers (ported dari ruang) ---
export function stripAnsi(output: string): string {
  return output.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
}
function lines(output: string): string[] {
  return stripAnsi(output).replace(/\r/g, "").split("\n");
}

// --- parseCronJobs: port logika ruang (header + field + fallback tabel Rich lama) ---
const CRON_JOB_HEADER = /^\s{0,4}(\S+)\s+\[(active|paused|completed|disabled)\]\s*$/;
const CRON_FIELD = /^\s{2,}(Name|Schedule|Repeat|Next run|Overdue|Last run):\s*(.*)$/;

export function parseCronJobs(output: string): ScheduledJob[] {
  const clean = stripAnsi(output);
  if (/^\s*No scheduled jobs\./im.test(clean)) return [];
  const jobs: ScheduledJob[] = [];
  let current: (Partial<ScheduledJob> & { id: string; status: string }) | undefined;
  const flush = () => {
    if (current?.schedule)
      jobs.push({
        name: current.name ?? current.id,
        schedule: current.schedule,
        id: current.id,
        status: current.status,
        ...(current.nextRun ? { nextRun: current.nextRun } : {}),
        ...(current.overdue ? { overdue: true } : {}),
        ...(current.repeat ? { repeat: current.repeat } : {}),
        ...(current.lastRun
          ? { lastRun: current.lastRun, lastRunOk: current.lastRunOk }
          : {}),
      });
    current = undefined;
  };
  for (const line of lines(clean)) {
    const header = line.match(CRON_JOB_HEADER);
    if (header) {
      flush();
      current = { id: header[1], status: header[2] };
      continue;
    }
    const field = current && line.match(CRON_FIELD);
    if (!field || !current) continue;
    const value = field[2].trim();
    if (field[1] === "Name") current.name = value === "(unnamed)" ? undefined : value;
    if (field[1] === "Schedule") current.schedule = value;
    if (field[1] === "Repeat") current.repeat = value;
    if (field[1] === "Next run") current.nextRun = value;
    if (field[1] === "Overdue") {
      current.nextRun = value.split(/\s{2,}/)[0];
      current.overdue = true;
    }
    if (field[1] === "Last run") {
      const [at, outcome = ""] = value.split(/\s{2,}/);
      current.lastRun = at;
      current.lastRunOk = /^ok\b/i.test(outcome);
    }
  }
  flush();
  if (jobs.length > 0) return jobs;
  // Fallback: tabel Rich lama (header baris + baris data).
  const { headers, rows } = tableRows(clean);
  const tableJobs = rows.flatMap((row) => {
    const name = headerValue(headers, row, ["name", "title"]);
    const schedule = headerValue(headers, row, ["schedule", "cron"]);
    const nextRun = headerValue(headers, row, ["next run", "next"]);
    const status = headerValue(headers, row, ["status"]);
    return name && schedule
      ? [
          {
            name,
            schedule,
            ...(nextRun ? { nextRun } : {}),
            ...(status ? { status } : {}),
          },
        ]
      : [];
  });
  if (tableJobs.length === 0) throw new Error("Unrecognized cron output.");
  return tableJobs;
}

// --- tabel Rich lama (fallback) — port dari ruang ---
export function tableRows(output: string): { headers: string[]; rows: string[][] } {
  const all = lines(output);
  const headerIndex = all.findIndex((l) => l.includes("─") || l.includes("-"));
  if (headerIndex < 0) return { headers: [], rows: [] };
  const headerLine = all[headerIndex - 1] ?? "";
  const headers = headerLine
    .split(/\s{2,}/)
    .map((h) => h.trim())
    .filter(Boolean);
  const rows: string[][] = [];
  for (let i = headerIndex + 1; i < all.length; i++) {
    const line = all[i];
    if (!line.trim() || /^[\s─-]+$/.test(line)) continue;
    const cells = line.match(
      new RegExp(`(\\S+(?:\\s{2,}\\S+)*)`, "g")
    );
    // Split baris tabel Rich lama pada selisih whitespace ≥2.
    const row = line
      .replace(/^[\s─-]+/, "")
      .split(/\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);
    void cells;
    if (row.length) rows.push(row);
  }
  return { headers, rows };
}
export function headerValue(
  headers: string[],
  row: string[],
  names: string[],
): string | undefined {
  const idx = headers.findIndex((h) => names.includes(h.toLowerCase()));
  return idx >= 0 ? row[idx] : undefined;
}

// --- collectCronJobs: fan-out per profile, tag agent, partial failure ---
export async function collectCronJobs(): Promise<Source<CronJobsSnapshot>> {
  const fetchedAt = new Date().toISOString();
  const rt = await readRuntime();
  const profiles = rt.availability === "ok" ? rt.data?.profiles ?? [] : [];
  // profile list gagal → baca cron aktif profil (tanpa -p), pola ruang.
  if (profiles.length === 0) {
    const r = await hermesRun(["cron", "list", "--all"]);
    if (r.exitCode !== 0)
      return {
        availability: "unavailable",
        data: { jobs: [], fetchedAt },
        error: r.stderr.trim() || "hermes cron list --all unavailable",
      };
    let jobs: ScheduledJob[];
    try {
      jobs = parseCronJobs(r.stdout);
    } catch {
      return {
        availability: "error",
        data: { jobs: [], fetchedAt },
        error: "could not parse cron list output",
      };
    }
    return { availability: "ok", data: { jobs, fetchedAt }, error: null };
  }
  const results = await Promise.all(
    profiles.map((p) => hermesRun(["-p", p, "cron", "list", "--all"])),
  );
  const jobs: ScheduledJob[] = [];
  const failedProfiles: string[] = [];
  for (let i = 0; i < profiles.length; i++) {
    const r = results[i];
    if (r.exitCode !== 0) {
      failedProfiles.push(profiles[i]);
      continue;
    }
    let parsed: ScheduledJob[];
    try {
      parsed = parseCronJobs(r.stdout);
    } catch {
      failedProfiles.push(profiles[i]);
      continue;
    }
    jobs.push(...parsed.map((j) => ({ ...j, agent: profiles[i] })));
  }
  if (failedProfiles.length === profiles.length)
    return {
      availability: "unavailable",
      data: { jobs: [], fetchedAt, failedProfiles },
      error: `all profiles failed: ${failedProfiles.join(", ")}`,
    };
  return {
    availability: "ok",
    data: { jobs, fetchedAt, ...(failedProfiles.length ? { failedProfiles } : {}) },
    error: null,
  };
}

// --- month grid util — port dari ruang/src/cron-calendar.ts (sudah teruji) ---
export function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function wallClock(stamp: string | undefined): { day: string; time: string } | undefined {
  const match = stamp?.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  return match ? { day: match[1], time: match[2] ?? "" } : undefined;
}

export function cronField(field: string, min: number, max: number): number[] | undefined {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const match = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    if (!match) return undefined;
    const step = match[3] ? Number(match[3]) : 1;
    const start = match[1] === "*" ? min : Number(match[1]);
    const end =
      match[1] === "*" ? max : match[2] ? Number(match[2]) : match[3] ? max : start;
    if (step < 1 || start < min || end > max || start > end) return undefined;
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

interface Cron {
  minutes: number[];
  hours: number[];
  days: number[];
  months: number[];
  weekdays: number[];
  anyDay: boolean;
  anyWeekday: boolean;
}

export function parseCron(schedule: string): Cron | undefined {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) return undefined;
  const [minutes, hours, days, months, weekdays] = [
    cronField(fields[0], 0, 59),
    cronField(fields[1], 0, 23),
    cronField(fields[2], 1, 31),
    cronField(fields[3], 1, 12),
    cronField(fields[4].replace(/\b7\b/g, "0"), 0, 6),
  ];
  if (!minutes || !hours || !days || !months || !weekdays) return undefined;
  return {
    minutes,
    hours,
    days,
    months,
    weekdays,
    anyDay: fields[2] === "*",
    anyWeekday: fields[4] === "*",
  };
}

function cronRunsOn(cron: Cron, year: number, month: number, day: number): boolean {
  if (!cron.months.includes(month + 1)) return false;
  const weekday = new Date(year, month, day).getDay();
  const dayMatch = cron.days.includes(day);
  const weekdayMatch = cron.weekdays.includes(weekday);
  if (!cron.anyDay && !cron.anyWeekday) return dayMatch || weekdayMatch;
  return dayMatch && weekdayMatch;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Semua entry semua job dalam satu bulan, keyed yyyy-mm-dd. Future run mulai dari `today`. */
export function monthEntries(
  jobs: ScheduledJob[],
  year: number,
  month: number,
  today: string,
): Map<string, CalendarEntry[]> {
  const entries = new Map<string, CalendarEntry[]>();
  const add = (key: string, entry: CalendarEntry) =>
    entries.set(key, [...(entries.get(key) ?? []), entry]);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (const job of jobs) {
    const tag = job.agent ? { agent: job.agent } : {};
    const status = (job.status ?? "").toLowerCase();
    const schedules = !["paused", "completed", "done", "disabled"].includes(status);
    const next = wallClock(job.nextRun);
    const last = wallClock(job.lastRun);
    if (last && last.day.startsWith(dayKey(year, month, 1).slice(0, 7)))
      add(last.day, {
        ...tag,
        job: job.name,
        kind: job.lastRunOk === false ? "last-failed" : "last-ok",
        label: last.time,
      });
    if (job.overdue && next)
      add(next.day, { ...tag, job: job.name, kind: "overdue", label: next.time });
    if (!schedules) continue;
    const cron = parseCron(job.schedule);
    const interval = job.schedule.match(/^every\s+(\d+)\s*([mhd])/i);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dayKey(year, month, day);
      if (key < today || (job.overdue && key === next?.day)) continue;
      if (cron) {
        if (!cronRunsOn(cron, year, month, day)) continue;
        const count = cron.hours.length * cron.minutes.length;
        add(
          key,
          count > 3
            ? { ...tag, job: job.name, kind: "interval", label: `${count}× a day` }
            : {
                ...tag,
                job: job.name,
                kind: "run",
                label: cron.hours
                  .flatMap((hour) =>
                    cron.minutes.map((minute) => `${pad(hour)}:${pad(minute)}`),
                  )
                  .join(", "),
              },
        );
      } else if (interval) {
        const amount = Number(interval[1]);
        const unit = interval[2].toLowerCase();
        if (unit === "d" && amount > 1) {
          const start = next?.day ?? today;
          const gap = Math.round((Date.parse(key) - Date.parse(start)) / 86_400_000);
          if (gap < 0 || gap % amount !== 0) continue;
          add(key, { ...tag, job: job.name, kind: "run", label: next?.time ?? "" });
        } else
          add(key, { ...tag, job: job.name, kind: "interval", label: job.schedule });
      } else if (next && next.day === key) {
        add(key, { ...tag, job: job.name, kind: "run", label: next.time });
      }
    }
  }
  return entries;
}

export { assertProfileName };
