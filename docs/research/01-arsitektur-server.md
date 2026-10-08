# Riset Arsitektur Server — repo `ruang` (yugienugraha/ruang)

Read-only analysis, cabang `main`. File inti: `server/mission-control.ts` (1041 baris),
`server/index.ts` (126), `server/memory.ts` (154), `server/folders.ts` (271),
`server/api-version.ts` (2). Semua path:line merujuk repo itu.

## 0. Peta singkat

| File | Peran |
|---|---|
| `server/index.ts` | Express app: routing `/api/*`, cache-buster `?fresh=1`, profil lock, static UI |
| `server/mission-control.ts` | Seluruh data collection: runner, parser CLI, cache, agregasi dashboard/office |
| `server/folders.ts` | Browser read-only folder tiap agent (`~/.hermes/profiles/<name>`, `~/.opencode`) dengan jail dan redaksi |
| `server/memory.ts` | View memori/konteks per agent (SOUL.md, memories/MEMORY.md, config.yaml) |
| `server/api-version.ts` | `API_VERSION = 12`, kontrak UI↔server |

Prinsip besar: **server tidak punya database**. Semua state = output CLI `hermes` yang diparse
teks/JSON, dibungkus `Source<T>`, di-cache in-memory TTL pendek, dan di-redact per-request.

## (a) Pola `read()` + wrapper `Source<T>`

Tipe (`server/mission-control.ts:16-20`):

```ts
export interface Source<T> {
  availability: Availability   // 'available' | 'unavailable'
  data: T                      // selalu diisi — fallback kalau gagal
  error?: { code: 'COMMAND_FAILED' | 'TIMEOUT' | 'LOCKED'; message: string }
}
```

Fungsi pembungkus (`server/mission-control.ts:491-497`):

```ts
async function read<T>(run: Run, file: string, args: string[], parse: (output: string) => T, fallback: T): Promise<Source<T>> {
  try { return { availability: 'available', data: parse(await run(file, args)) } }
  catch (error) { return failure(error, fallback) }
}
```

Kenapa begini:
- **Tidak ada exception yang lolos ke route.** Gagal baca CLI = `availability: 'unavailable'` +
  `data: fallback` (biasanya `[]`), UI tetap render dengan state "Not Available" per-seksi
  (`server/mission-control.ts:924`, `970-972`).
- **Kode error disaring** di `failure()` (`server/mission-control.ts:484-489`): `TIMEOUT`,
  `COMMAND_FAILED`, atau pesan "Unrecognized …" saat parser gagal mengenali format output.
- **Kode `LOCKED`** bukan dari CLI, tapi dari redact profil lock: `redactLogs` mengganti file
  jadi `Source` unavailable dengan `code: 'LOCKED'` (`server/privacy.ts:50`).
- UI bisa membedakan "agent tidak ada", "CLI error", "masih loading" dari satu struktur.
- Pola sama dipakai memory: `readDocument` mengubah `FolderError` 404 jadi `exists: false`
  (`server/memory.ts:71`), dan `collectMemory` menangkap error per-agent supaya satu agent
  rusak tidak menjatuhkan halaman (`server/memory.ts:148-152`).

## (b) Katalog command Hermes CLI + parsing

Runner: `execFile` promisified (`server/mission-control.ts:1-4, 453-470`) — arg array,
tanpa shell, jadi tidak ada shell-injection.

| Command | Pemakaian | Parser |
|---|---|---|
| `hermes profile list` | daftar profile + model + gateway state | `parseProfiles` (`:507`, parser `:147-174`) |
| `opencode --version` | deteksi terpasang/tidak | trim baris terakhir (`:508`) |
| `hermes kanban boards list --json` | daftar board | `parseBoards` (`:537`, `:516-526`) |
| `hermes kanban list --json` | fallback tanpa board | `parseTasks` (`:538`, `:193-209`) |
| `hermes kanban --board <slug> list --json` | tasks per board, konkurensi 4 | `parseTasks` (`:541`) |
| `hermes kanban [--board <slug>] show <id> --json` | detail task | `parseTaskDetail` (`:743`, `:704-738`) |
| `hermes -p <profile> cron list --all` | cron per profile | `parseCronJobs` (`:558`, `:242-282`) |
| `hermes cron list --all` | fallback kalau profile list gagal | `parseCronJobs` (`:557`) |
| `hermes sessions list --limit 20` | aktivitas | `parseSessions` (`:566`, `:286-317`) |
| `hermes -p <profile> sessions list --limit 3` | probe aktivitas live | `:810` |
| `hermes skills list --enabled-only` | knowledge | `parseSkills` (`:571`, `:319-330`) |
| `hermes status --all` | kanal messaging + sesi aktif | `parseChannelStatus` (`:576`, `:332-352`) |
| `hermes insights --days <1\|7\|30>` (opsional `-p <profile>`) | usage token | `parseInsights` (`:587, 610`, `:354-401`) |
| `hermes logs <agent\|gateway\|errors> -n 200` | log tail | `parseLogLines` (`:638`, `:417-430`) |
| `hermes -p <profile> logs agent -n 80 --since 3m` | aktivitas live per profile | `parseRecentActivity` (`:809`, `:772-794`) |

Cara parse:
- **JSON** (`kanban *`): `jsonPayload` (`:188-191`) mencari baris pertama yang mulai `[[{]`,
  memotong notice Hermes sebelum JSON, lalu `JSON.parse`.
- **Tabel/teks**: regex per format. Profil = baris tabel `Profile Model running|stopped`
  (`:147-168`). Cron = header `^\s*(\S+)\s+[(active|paused|…)]` + field `Name/Schedule/…`
  dengan fallback tabel Rich lama (`:239-282`). Sessions = posisi kolom dari header,
  cell dipotong berdasarkan offset header (`:284-317`).
- **Toleransi format lama/baru**: cron punya dua jalur parse (`:242-282`), kanal cek heading
  baru "◆ Sessions" dan legacy "Active sessions:" (`:346-350`).
- Semua output lewat `stripAnsi` (`:131-133`) karena runner sudah set `NO_COLOR=1`.

## (c) Strategi caching

Nilai tetap (`server/mission-control.ts:5-9`, `server/index.ts:36`):

| Konstanta | Nilai | Pemakaian |
|---|---|---|
| `CACHE_MS` | 10_000 | TTL default semua snapshot (`:982`) |
| `INSIGHTS_CACHE_MS` | 60_000 | `usageSources` per-periode (`:1002`) |
| `COMMAND_TIMEOUT_MS` | 8_000 | timeout `execFile` (`:458`) |
| (literal) | 5_000 | `logsSource` (`:1008`) |
| (literal) | 15_000 | `agentActivitySource` (`:1009-1012`) |
| `FRESH_WINDOW_MS` | 8_000 | `index.ts:36` |

Mekanisme cache (`:982-994`): closure per source dengan dua field — `entry` (value + expiry)
dan `inflight` (promise berjalan). Kalau `entry.expires > now` kembalikan nilai lama;
kalau tidak, `inflight ??= collect()` — **pembaca concurrent berbagi satu in-flight promise**,
tidak membanjiri CLI. Ada `clear()` untuk invalidate manual.

```ts
const get = (now = Date.now()): Promise<T> => {
  if (entry && entry.expires > now) return Promise.resolve(entry.value)
  inflight ??= collect().then((value) => { entry = { value, expires: Date.now() + ttl }; return value })
    .finally(() => { inflight = undefined })
  return inflight
}
```

`?fresh=1` (`server/index.ts:35-55`):

```ts
const now = Date.now() + (request.query.fresh === '1' ? FRESH_WINDOW_MS : 0)
```

Trik kecil tapi elegan: alih-alih path cache bypass khusus, route **menambah 8 detik ke
"sekarang"**. Karena cache menyimpan `expires = Date.now() + 10_000`, menaikkan `now` 8 detik
artinya entry yang berumur > 2 detik dianggap kedaluwarsa dan di-refetch. Comment di
`index.ts:35` menyebutnya: "bypasses the 10s cache for anything older than 2s". Jadi refresh
manual tetap memanfaatkan entry yang sangat baru (< 2s), tidak membajak in-flight yang masih jalan.

Per-source TTL berbeda disengaja: logs (5s) dan live activity (15s) butuh lebih segar;
insights berat (60s). `getUsage(days)` punya cache terpisah per periode 1/7/30 hari (`:1002-1007`).

## (d) Command runner `systemRun` + audit log

```ts
// server/mission-control.ts:453-470
const { stdout } = await execFile(file, args, {
  timeout: COMMAND_TIMEOUT_MS,                                  // 8_000 ms
  maxBuffer: 16 * 1024 * 1024,                                  // 16 MB
  env: { ...process.env, NO_COLOR: '1', TERM: 'dumb', COLUMNS: '200', PYTHONIOENCODING: 'utf-8' },
})
```

- **Env overrides**: `NO_COLOR` + `TERM=dumb` mematikan warna ANSI, `COLUMNS=200` memaksa lebar
  tabel tetap (parser bergantung kolom rata), `PYTHONIOENCODING=utf-8` mengunci encoding.
- **Audit log**: `recordCommand` menaruh `CommandLogEntry` (`{command, ok, durationMs, at, error?}`)
  ke array in-memory, unshift, dipotong ke `COMMAND_LOG_LIMIT = 100` (`:435-440`). Ditambah
  di dua sisi: sukses (`:462`) dan gagal (`:467`). `commandHealth()` (`:472-476`) menghitung
  total/failed/averageMs; diekspos lewat `/api/command-log` (`index.ts:48`) dan masuk dashboard
  (`:1040`, field `commands`).

Pemetaan kegagalan → error code (`describeFailure`, `:442-451`):

| Kondisi | `CommandError.code` | Pesan |
|---|---|---|
| `killed` / `SIGTERM` / pesan timeout | `TIMEOUT` | "Read timed out." |
| `ENOENT` | `COMMAND_FAILED` | "Command not installed or not on PATH." |
| `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` | `COMMAND_FAILED` | "Command output exceeded the read limit." |
| exit code numerik | `COMMAND_FAILED` | "Command exited with code N." |
| lainnya | `COMMAND_FAILED` | "Read command was unavailable." |

`LOCKED` tidak pernah datang dari runner — hanya dari lapisan profil lock (`privacy.ts:50`).

Mekanisme **"benign"**: opsi `benign?: RegExp` pada `RunOptions` (`:116-117`). Contoh: `hermes logs`
exit 1 sebelum file log ada; kalau stdout cocok `/Log file not found/i` (`:633`), entry audit
ditandai `ok: true` dan error dianggap state kosong, bukan kegagalan (`:641, 646, 809`).

## (e) Penentuan state agent (Office)

Tipe: `OfficeState = 'Idle' | 'Working' | 'Reviewing' | 'Collaborating' | 'Offline' | 'Unknown'`
(`:39`). Sumber data **eksplisit, bukan tebakan kata kunci semata** — ada tiga lapis bukti
di `buildOfficeSnapshot` (`:902-951`), diurutkan dari yang paling langsung:

1. **Live activity** (`collectAgentActivity` `:806-816`): probe per profile (maks 4 paralel)
   `hermes -p <profile> logs agent -n 80 --since 3m` + `sessions list --limit 3`.
   `parseRecentActivity` (`:772-794`) memetakan logger ke jenis kerja — **ini tebakan berbasis
   nama logger, tapi dari log sistem Hermes sendiri**:
   - `cron*` → cron; `tools|model_tools*` → tools; `agent|run_agent|batch_runner*` → thinking;
   - `gateway|hermes_plugins|plugins.platforms*` dengan pesaing kata chat (`CHAT_MESSAGE`,
     `:756`) → chat, tanpa itu hanya "gateway" (diabaikan sebagai noise polling, `:785-786`);
   - `hermes_cli`, `uvicorn`, `gui` → bukan kerja agent (`:769`).
   Kalau tidak ada log tapi session `lastActive` = "just now" / "0-3m ago", tetap dihitung chat (`:787-791`).
2. **Kanban task** dengan `assignee` = profile (`attributedTask` `:838-846`): status `running`
   → Working, `review` → Reviewing (`taskState` `:848-853`).
3. **Session kolaborasi**: session `active` dengan `actor` = alias agent → Collaborating
   (`collaborationState` `:855-857`).

Fusi (`:917-923`): overlay state eksplisit (`ExplicitOfficeState`, `expiresAt` masih berlaku,
`:864-866`) > bukti langsung (live) yang dikoreksi task Kalau live tidak diketahui, task >
kolaborasi > **Idle hanya kalau runtime + board + activity semuanya fresh** (≤ 30 s, `isFresh`
`:859-862`) > selain itu Unknown. Gateway `Stopped` **bukan** Offline — hanya berarti tidak
dengar di platform pesan (`:919-921`); "Offline" muncul dari kebijakan penempatan `roomForState`.
OpenCode (tanpa profile) dianggap Working kalau log profile manapun menyebut "opencode" (`:892-895`).
Setiap stasiun membawa string `provenance` (`:946`) yang menjelaskan sumber data apa yang
dipakai — auditbility by design.

## (f) Validasi input: `PROFILE_NAME`, `BOARD_SLUG`, `TASK_ID`

```ts
// server/mission-control.ts:503
export const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
// server/mission-control.ts:514
export const BOARD_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/
// server/mission-control.ts:678
export const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
// server/folders.ts:15 (varian tanpa titik)
export const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
```

Comment di kode menyebut alasannya eksplisit:
- `PROFILE_NAME` (`:502`): "plain names only, **never anything that looks like an option**" —
  nilai dari profile list diteruskan ke `hermes -p <name>` (`:558, 610, 807-810`). Regex
  memblokir nilai berawalan `-` (akan dibaca CLI sebagai flag, mis. `-p --help`) dan
  path separator.
- `BOARD_SLUG` (`:513`): "Hermes' own slug rule, never an option" — masuk ke
  `hermes kanban --board <slug>` (`:541, 743`) dan `?board=` query (`index.ts:62`).
- `TASK_ID` (`:741`): id dari URL `/api/tasks/:id` masuk ke `kanban show <id>`; dicek lagi
  saat `getTaskDetail` (`:1026`).
- Di `folders.ts`, profile name adalah **nama folder**: `resolveAgentFolders` menyaring dengan
  regex (`folders.ts:236`) sebelum membangun path `profiles/<name>` — mencegah traversal
  (`../`) sejak awal; lapisan kedua `safeRelativePath` menolak segmen `..` (`folders.ts:56-63`)
  dan `resolveInside` menguji `realpath` hasil masih di dalam base (`folders.ts:79-87`).
- Sisi positif: karena nama profile "Display Name (id)" di-strip jadi id (`:161-163`), id yang
  tidak lolos regex ikut terbuang dari roster (`:826`) — parser dan validasi saling menutup.

Ancaman yang dicegah: command/argument injection ke `execFile`, path traversal ke luar folder
agent, dan pemalsuan data roster.

## (g) Partial failure: satu sumber gagal ≠ halaman mati

1. **Per-sumber**: setiap collector adalah `read(...)` → error menjadi `Source` unavailable
   dengan fallback kosong (lihat (a)). Route selalu menjawab 200 dengan JSON berisi
   `availability` per bagian.
2. **Fan-out per item**: untuk operasi multi-profile/board, kegagalan satu item tidak
   menghapus hasil lain:
   - `collectTaskBoard` (`:535-546`): board yang gagal dicatat di `failedBoards`; kalau *semua*
     board gagal baru jatuh ke hasil pertama.
   - `collectCalendar` (`:553-563`): profil yang gagal dicatat `failedProfiles`; hanya jika
     semua profil gagal baru snapshot = hasil pertama.
   - `collectUsage` (`:607-625`): per-agent error jadi `AgentUsage.error`, totals dihitung dari
     yang berhasil saja.
   - `collectLogs` (`:635-646`): satu file log rusak tetap menampilkan dua lainnya.
   - `collectMemory` (`server/memory.ts:147-152`): `.catch` per folder → agent jadi
     `available: false` + `reason`.
3. **Agregasi dashboard** (`buildDashboard` `:956-977`) selalu menghitung dari `.data` (fallback
   `[]`) — tidak pernah melempar.
4. **Office** menandai freshness per sumber (`freshRuntime/freshBoard/freshActivity`, `:905-907`)
   dan hanya menyimpulkan `Idle` kalau ketiganya segar; kalau tidak, `Unknown` — bukan data palsu.
5. **Error tak terduga** di route ditangkap middleware global (`index.ts:120-124`) → 500 JSON
   `{ error: 'Internal error' }`, tanpa crash proses.
6. Filosofi serupa di `folders.ts`: `fsError` (`:70-77`) menerjemahkan EACCES/ENOENT/ELOOP ke
   pesan yang bisa ditindaklanjuti, list stat gagal tetap menampilkan entry `unreadable: true`
   (`:155-163`).

## Ringkasan pola untuk roomoff

1. Bungkus semua bacaan sumber eksternal (CLI/HTTP) jadi `{ availability, data, error? }`;
   jangan pernah buang exception ke route.
2. Parser bertoleransi dua format (baru + legacy) dan selalu strip ansi.
3. Cache closure per-source: TTL pendek + `inflight` dedup; refresh manual = geser `now`.
4. Runner tunggal dengan timeout, maxBuffer, env deterministik, audit log, pemetaan error ke
   kode stabil (`COMMAND_FAILED`/`TIMEOUT`), plus pengecualian "benign" untuk exit code yang
   sebenarnya state kosong.
5. Validasi semua nilai dari URL/CLI-output yang diteruskan ke subprocess dengan regex ketat
   sebelum jadi argumen — cegah opsi-injection dan traversal.
6. Redact per-request di atas snapshot bersih (bukan simpan data privat terpisah), agar cache
   tetap satu tapi privasi tetap per-viewer.
