# R3 — Cron multi-profile + month view (kontrak implementasi)

Repo: /home/basrenk/projects/viroom, branch `feat/R3`. Jangan push ke main.
Backend: Elysia (Bun) di `src/`. Frontend: Vite+React19+shadcn+Tailwind v4+zustand di `frontend/`.
Runtime: bun di `/home/pn/.bun/bin/bun` (PATH=/home/pn/.bun/bin:$PATH).

## Prinsip
- Ruang = referensi pola, TIDAK di-copy mentah. Port ke Elysia + pola repo viroom.
- Boring > clever. Read-only terhadap `hermes` CLI. Jangan tambah dep baru (bun test + bun:sqlite bawaan).
- Semua input yang masuk `execFile` divalidasi regex (pola R1).
- Source gagal = `unavailable` + fallback, tidak pernah throw ke route.
- Data asli saja — fake binary hanya di test.

## A. Backend `src/hermes.ts` (adapter, port dari commit R1 `bcbb454`)
Ambil persis dari commit R1 (source of truth):
  git show bcbb454:src/hermes.ts > src/hermes.ts
Isi: Source<T>, systemRun(execFile,8s,NO_COLOR,COLUMNS=200), hermesRun (cache 10s+inflight dedup,
HERMITES_BIN override per-panggilan), PROFILE_NAME/BOARD_SLUG regex guard, clearHermesCache,
readHealth/readRuntime/readTasks. JANGAN tambah di sini.
- R1 test juga: git show bcbb454:test/adapter.test.ts > test/adapter.test.ts
- R1 juga pernah tambah endpoint di src/index.ts — TIDAK ambil itu (R0 scaffold sudah punya
  src/api.ts + src/index.ts). Tambah endpoint cron di src/api.ts, jangan index.ts.

## B. Backend `src/cron.ts` (baru) — parser + month grid, port dari ruang
Sumber: /home/basrenk/projects/ruang/server/mission-control.ts `parseCronJobs` (±:242-282)
         + ruang/src/cron-calendar.ts (parseCron, cronField, cronRunsOn, monthEntries, dayKey).
Port ke `src/cron.ts`:
- `interface ScheduledJob { private?: boolean; name: string; schedule: string; id?: string;
   nextRun?: string; overdue?: boolean; status?: string; repeat?: string; lastRun?: string;
   lastRunOk?: boolean; agent?: string }`
- `parseCronJobs(output: string): ScheduledJob[]` — port logika ruang persis (header
  `^\s{0,4}(\S+)\s+\[(active|paused|completed|disabled)\]\s*$` + field
  `^\s{2,}(Name|Schedule|Repeat|Next run|Overdue|Last run):\s*(.*)$`, fallback tabel Rich lama
  pakai tableRows/headerValue dari ruang, stripAnsi). "No scheduled jobs." → [].
- `cronField(field,min,max): number[]|undefined`, `parseCron(schedule): Cron|undefined`,
  `monthEntries(jobs, year, month, today): Map<string, CalendarEntry[]>`,
  `dayKey(y,m,d): string` — salin dari ruang/src/cron-calendar.ts persis (sudah teruji).
  `CalendarEntry { job: string; kind: 'run'|'interval'|'overdue'|'last-ok'|'last-failed'; label: string; agent?: string }`.
- Helper internal (bisa export untuk test): `stripAnsi`, `lines`, `tableRows`, `headerValue`.
- Helper collect per-profile (pakai hermesRun dari hermes.ts + readRuntime):
  `collectCronJobs(): Promise<Source<{jobs: ScheduledJob[]; failedProfiles?: string[]; fetchedAt: string}>>`
  — fan-out `hermes -p <profile> cron list --all` per profile dari readRuntime().data.profiles,
  tag `agent: <profile>`; kalau profile list gagal → `hermes cron list --all` tanpa -p.
  Satu profile gagal → masuk failedProfiles, tidak meruntuhkan yang lain (pola ruang collectCalendar).

## C. Endpoint Elysia `src/api.ts`
Tambah di Elysia instance `api` (prefix /api):
  GET /cron → envelope `{ status: 'ok'|'unavailable'|'error', data: { jobs: ScheduledJob[]; failedProfiles?: string[]; fetchedAt: string }, error?: string }`
  (pakai Source wrapper dari hermes.ts; status 'ok' saat availability 'ok'.)
Query opsional: `?agent=<profile>` → filter jobs dengan `agent` (validasi regex PROFILE_NAME,
invalid → 400 envelope error). Default semua agen.
Jangan ubah endpoint lain yang sudah ada di src/api.ts.

## D. Test `test/cron.test.ts` (vitest, fake binary, TIDAK perlu hermes asli)
Test runner = vitest (bukan bun test): jalankan `bunx vitest run` (tsconfig.test.ts + vitest.config.ts
sudah ada; bun:sqlite di-alias ke test/sqlite-shim.ts). Konsisten dengan test/ yang sudah ada
(di-mock, partial-failure).
- Override HERMITES_BIN ke file shell fake (di test-bin/, sudah di-gitignore) yang handle:
  `--version` → "hermes 0.9.9"; `profile list` → daftar profil; `-p <p> cron list --all`
  (dan `cron list --all` tanpa -p) → output header + field Name/Schedule/Next run/Overdue/Last run.
  Import `clearHermesCache` dari src/hermes untuk reset antar test.
- Unit parseCronJobs:
  - output valid multi-job → ScheduledJob[] benar (name, schedule, nextRun, overdue, lastRun,
    lastRunOk, status); agent di-tag oleh collectCronJobs.
  - "No scheduled jobs." → [].
  - job paused + lastRun failed → status paused, lastRunOk false.
- monthEntries (port kasus ruang cron-calendar.test.ts):
  - daily cron `0 8 * * *` → tiap hari mulai today (Oct 2026, today '2026-10-10'), label '08:00'.
  - `*/15 * * * *` → '96× a day' interval.
  - `every 2d` multi-day; paused → last-failed; overdue marker; agent dipeertahankan di entry.
- Endpoint Elysia GET /api/cron via `app.listen` (import default app dari src/index.ts, HERMITES_BIN=fake):
  - 200 envelope status 'ok', data.jobs ada, agent ter-tag, fetchedAt ada.
  - GET /api/cron?agent=sanji → hanya jobs agen sanji.
  - GET /api/cron?agent=Bad%2Fslug → 400 envelope error (regex guard).
  - Endpoint lain (GET /api/health) tetap 200.
- JANGAN klaim lulus tanpa jalan: `bunx vitest run` + `bunx tsc --noEmit -p tsconfig.json` exit 0.

## E. Frontend `frontend/src/pages/Calendar.tsx` (baru, shadcn dark, BUKAN CSS ruang)
Gaya: Tailwind v4 + shadcn Card/Button + dark theme (zinc-900/950), pakai `@/components/ui/card`,
`@/components/ui/button`, `cn`, `lucide-react` (kalau perlu). Alias `@/` → frontend/src/.
- Fetch `/api/cron` (dev proxy vite.config.ts sudah ada /api → :3000).
- Month grid: salin LOGIKA dari ruang/src/pages/Calendar.tsx `MonthView` (dayKey/lead/days/cells,
  move prev/next, Today, filter agen, selected day detail, legend run/interval/last/overdue)
  tapi render pakai Tailwind/shadcn classes (bukan `.month-*` CSS ruang).
- Filter per agen: dropdown dari `jobs` (agent unik), "All agents (N)" + per agen (count).
- Overdue marker: entry kind 'overdue'/'last-failed' tampil merah (text-red/border-red dot).
- Status: pending (loading), unavailable (banner "CLI tak tersedia"), error (pesan), empty
  ("No scheduled jobs"). Jangan crash.
- Sertakan juga daftar job (schedule, status, nextRun/overdue, lastRun ok/failed) seperti ruang Calendar.

## F. Integrasikan `frontend/src/App.tsx`
Tambah nav sederhana (tab) untuk halaman Calendar agar terjangkau dari App. Jaga alur health check
yang sudah ada tetap jalan. Tidak perlu router library baru — pola store hash/tab sederhana.
(Aturan R4: jangan tambah router library. Satu komponen + fetch hook kecil cukup.)

## G. Verifikasi wajib (sebelum klaim selesai)
  cd /home/basrenk/projects/viroom && export PATH="/home/pn/.bun/bin:$PATH"
  1) bun test                       # semua lulus, exit 0
  2) bunx tsc --noEmit              # typecheck server, exit 0
  3) cd frontend && bun run typecheck && bun run build   # frontend build hijau
  (bun build frontend = vite build; kalau gagal, laporkan error mentah.)

## Done =
- src/hermes.ts (R1 adapter) + src/cron.ts (parser+month+collect) + endpoint /api/cron di src/api.ts.
- test/adapter.test.ts (R1) + test/cron.test.ts lulus.
- frontend/src/pages/Calendar.tsx (month grid shadcn, filter agen, overdue) + App.tsx nav.
- bun test + tsc --noEmit + frontend build exit 0.
- Commit di feat/R3. Jangan push main. Jangan commit secret.
