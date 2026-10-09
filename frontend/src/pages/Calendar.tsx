// R3 — halaman Calendar: month grid cron jobs multi-agent.
//
// Data masuk dari GET /api/cron (lihat src/store.ts useCronStore). Penempatan
// job ke hari dihitung di client oleh monthEntries() di src/lib/cron-calendar.ts.
// Gaya: Tailwind v4 + komponen shadcn yang sudah ada (@/components/ui/*),
// dark zinc-900/950. Tanpa router — App.tsx melakukan tab switching.

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  dayKey,
  monthEntries,
  type CalendarEntry,
  type ScheduledJob,
} from "@/lib/cron-calendar";
import { useCronStore } from "@/store";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] as const;

const KIND_LABEL: Record<CalendarEntry["kind"], string> = {
  run: "Jadwal run",
  interval: "Berulang sepanjang hari",
  overdue: "Overdue",
  "last-ok": "Run terakhir · ok",
  "last-failed": "Run terakhir · gagal",
};

/** Warna chip per jenis entry. Overdue/gagal merah, sesuai brief R3. */
const KIND_CLASS: Record<CalendarEntry["kind"], string> = {
  run: "bg-zinc-800 border-zinc-700 text-zinc-200",
  interval: "bg-blue-500/10 border-blue-500/40 text-blue-300",
  "last-ok": "bg-green-500/10 border-green-500/40 text-green-300",
  "last-failed": "bg-red-500/20 border-red-500 text-red-300",
  overdue: "bg-red-500/20 border-red-500 text-red-300",
};

/** Badge warna per agen, diturunkan dari nama supaya stabil tanpa config server. */
const AGENT_TONES = [
  "bg-zinc-700 text-zinc-100 border-zinc-600",
  "bg-sky-500/15 text-sky-300 border-sky-500/40",
  "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  "bg-amber-500/15 text-amber-300 border-amber-500/40",
  "bg-violet-500/15 text-violet-300 border-violet-500/40",
  "bg-rose-500/15 text-rose-300 border-rose-500/40",
];

function agentTone(agent: string): string {
  let hash = 0;
  for (let i = 0; i < agent.length; i += 1) hash = (hash * 31 + agent.charCodeAt(i)) >>> 0;
  return AGENT_TONES[hash % AGENT_TONES.length];
}

function AgentBadge({ agent }: { agent: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1 py-px text-[10px] font-medium",
        agentTone(agent),
      )}
    >
      {agent}
    </span>
  );
}

function todayKey(): string {
  const now = new Date();
  return dayKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDateTime(stamp?: string): string {
  if (!stamp) return "—";
  const match = stamp.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!match) return stamp;
  return `${match[2] ?? "—"} · ${match[1]}`;
}

/** Month grid: run berikutnya mulai hari ini, plus marker overdue dan run terakhir. */
function MonthView({ jobs }: { jobs: ScheduledJob[] }) {
  const today = todayKey();
  const [agent, setAgent] = useState("");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selected, setSelected] = useState(today);

  const agents = useMemo(
    () =>
      [...new Set(jobs.map((job) => job.agent).filter((a): a is string => Boolean(a)))].sort(),
    [jobs],
  );
  const filtered = agent ? jobs.filter((job) => job.agent === agent) : jobs;
  const entries = useMemo(
    () => monthEntries(filtered, cursor.year, cursor.month, today),
    [filtered, cursor.year, cursor.month, today],
  );

  const first = new Date(cursor.year, cursor.month, 1);
  const lead = (first.getDay() + 6) % 7; // kolom 0 = Senin
  const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  const move = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const selectedEntries = entries.get(selected) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => move(-1)} aria-label="Bulan sebelumnya">
          ‹
        </Button>
        <h2 className="min-w-40 text-center text-lg font-semibold">
          {first.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
        </h2>
        <Button variant="outline" size="sm" onClick={() => move(1)} aria-label="Bulan berikutnya">
          ›
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const now = new Date();
            setCursor({ year: now.getFullYear(), month: now.getMonth() });
            setSelected(today);
          }}
        >
          Hari ini
        </Button>

        <label className="ml-auto flex items-center gap-2 text-sm text-zinc-400">
          Agen
          <select
            value={agent}
            onChange={(event) => setAgent(event.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          >
            <option value="">Semua agen ({jobs.length})</option>
            {agents.map((item) => (
              <option key={item} value={item}>
                {item} ({jobs.filter((job) => job.agent === item).length})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-zinc-300" /> run
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-400" /> berulang
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-green-400" /> terakhir ok
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> gagal / overdue
        </span>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="bg-zinc-900 px-2 py-1.5 text-center text-xs font-medium text-zinc-400"
          >
            {day}
          </div>
        ))}
        {cells.map((day, index) => {
          if (day === null)
            return <div key={`lead-${index}`} className="min-h-24 bg-zinc-950/50" aria-hidden="true" />;
          const key = dayKey(cursor.year, cursor.month, day);
          const list = entries.get(key) ?? [];
          const isToday = key === today;
          const isSelected = key === selected;
          const isPast = key < today;
          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelected(key)}
              aria-label={`${key}: ${list.length} item`}
              aria-pressed={isSelected}
              className={cn(
                "flex min-h-24 flex-col gap-1 p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400",
                isPast ? "bg-zinc-950/60" : "bg-zinc-900",
                isSelected ? "ring-1 ring-inset ring-zinc-400" : "hover:bg-zinc-800",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
                  isToday ? "bg-zinc-100 font-semibold text-zinc-900" : "text-zinc-400",
                )}
              >
                {day}
              </span>
              {list.slice(0, 2).map((entry, entryIndex) => (
                <span
                  key={`${entry.job}-${entry.kind}-${entryIndex}`}
                  title={`${entry.job}${entry.agent ? ` (${entry.agent})` : ""} · ${KIND_LABEL[entry.kind]} ${entry.label}`}
                  className={cn(
                    "flex items-center gap-1 truncate rounded border px-1 py-px text-[10px]",
                    KIND_CLASS[entry.kind],
                  )}
                >
                  <span className="shrink-0 font-semibold">{entry.label || "—"}</span>
                  {entry.agent && <AgentBadge agent={entry.agent} />}
                </span>
              ))}
              {list.length > 2 && (
                <span className="text-[10px] text-zinc-500">+{list.length - 2} lagi</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          {new Date(`${selected}T00:00:00`).toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        {selectedEntries.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Tidak ada job di tanggal ini.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {selectedEntries.map((entry, index) => (
              <li key={`${entry.job}-${entry.kind}-${index}`} className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex rounded border px-1.5 py-px text-[11px]",
                    KIND_CLASS[entry.kind],
                  )}
                >
                  {KIND_LABEL[entry.kind]}
                </span>
                <span className="text-sm text-zinc-100">{entry.job}</span>
                {entry.agent && <AgentBadge agent={entry.agent} />}
                {entry.label && <span className="text-sm text-zinc-400">{entry.label}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          Jam mengikuti waktu lokal host Hermes. Job paused hanya menampilkan run terakhirnya.
        </p>
      </div>
    </div>
  );
}

/** Daftar job di bawah grid: schedule, status, next/overdue, hasil run terakhir. */
function JobList({ jobs }: { jobs: ScheduledJob[] }) {
  const sorted = [...jobs].sort((a, b) => (a.nextRun ?? "~").localeCompare(b.nextRun ?? "~"));
  if (sorted.length === 0)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Belum ada cron job</CardTitle>
          <CardDescription>Hermes tidak melaporkan job apa pun.</CardDescription>
        </CardHeader>
      </Card>
    );

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {sorted.map((job) => {
        const key = `${job.agent ?? ""}:${job.id ?? `${job.name}-${job.schedule}`}`;
        return (
          <li key={key}>
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {job.name}
                  {job.agent && <AgentBadge agent={job.agent} />}
                  {job.status && (
                    <span className="rounded border border-zinc-700 px-1.5 py-px text-[11px] font-normal text-zinc-400">
                      {job.status}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  <code className="text-zinc-300">{job.schedule}</code>
                  {job.repeat ? ` · ulangi ${job.repeat}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-zinc-500">{job.overdue ? "Overdue sejak" : "Run berikutnya"}</dt>
                  <dd className={job.overdue ? "text-red-400" : "text-zinc-200"}>
                    {formatDateTime(job.nextRun)}
                  </dd>
                  {job.lastRun && (
                    <>
                      <dt className="text-zinc-500">Run terakhir</dt>
                      <dd className="text-zinc-200">
                        {formatDateTime(job.lastRun)}{" "}
                        <span
                          className={cn(
                            "rounded border px-1.5 py-px text-[11px]",
                            job.lastRunOk === false
                              ? "border-red-500 bg-red-500/20 text-red-300"
                              : "border-green-500/40 bg-green-500/10 text-green-300",
                          )}
                        >
                          {job.lastRunOk === false ? "gagal" : "ok"}
                        </span>
                      </dd>
                    </>
                  )}
                </dl>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

export default function Calendar() {
  const status = useCronStore((s) => s.status);
  const jobs = useCronStore((s) => s.jobs);
  const fetchedAt = useCronStore((s) => s.fetchedAt);
  const failedProfiles = useCronStore((s) => s.failedProfiles);
  const error = useCronStore((s) => s.error);
  const fetchCron = useCronStore((s) => s.fetchCron);

  useEffect(() => {
    if (status === "idle") fetchCron();
  }, [status, fetchCron]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Hermes Cron</p>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Cron job semua agen (Hermes menyimpan cron per profile), termasuk job paused. Event
            kalender umum tidak ditampilkan.
          </p>
        </div>
        <Button variant="secondary" onClick={() => fetchCron()}>
          Muat ulang
        </Button>
      </div>

      {fetchedAt && status === "ok" && (
        <p className="text-xs text-zinc-500">Diperbarui {formatDateTime(fetchedAt)}</p>
      )}

      {failedProfiles.length > 0 && (
        <p
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
          Cron job profil {failedProfiles.join(", ")} tidak terbaca, jadi tidak tampil di sini.
        </p>
      )}

      {(status === "idle" || status === "loading") && (
        <p className="text-sm text-zinc-400" role="status">
          Memuat cron job…
        </p>
      )}

      {status === "unavailable" && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle>CLI Hermes tidak tersedia</CardTitle>
            <CardDescription>
              {error ?? "Source cron tidak bisa dibaca. Job mungkin tidak bisa dimuat sekarang."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {status === "error" && (
        <Card className="border-red-500/40">
          <CardHeader>
            <CardTitle>Gagal memuat cron job</CardTitle>
            <CardDescription>{error ?? "Terjadi kesalahan saat menghubungi backend."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" size="sm" onClick={() => fetchCron()}>
              Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "ok" && jobs.length === 0 && <JobList jobs={[]} />}
      {status === "ok" && jobs.length > 0 && (
        <>
          <MonthView jobs={jobs} />
          <JobList jobs={jobs} />
        </>
      )}
    </div>
  );
}
