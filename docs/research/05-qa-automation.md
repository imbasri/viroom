# QA Automation Riset — repo ruang

**Sumber:** /home/basrenk/projects/ruang (statis, no build/install)
**Tanggal riset:** 2026-10-09

---

## (a) Framework

- **Test runner:** `vitest ^3.2.4` (devDependency di `package.json`).
- **Script:** `"test": "vitest run"` di `package.json`; **tidak ada** `vitest.config.*` maupun `vite.config` — vitest berjalan dengan default, tanpa config file terpisah.
- **jsdom:** tidak di-setup secara global; environment jsdom diaktifkan **per-file** lewat directive JSDoc di baris paling atas file test: `// @vitest-environment jsdom` → hanya `src/office-dialog-focus.test.tsx`.
- **Server-side test** (`server/*.test.ts`) berjalan di **node**, menggunakan `express` untuk mount middleware dan `app.listen(0, '127.0.0.1')` → port dinamis, `fetch` ke localhost untuk hitting route langsung.
- **Client-side test** (`src/*.test.tsx`) di-node, **bukan browser/Playwright**:
  - DOM + keyboard event: `office-dialog-focus.test.tsx` (jsdom + `vi.stubGlobal('fetch')` + mock `Response`).
  - Render markup: `renderToStaticMarkup` (react-dom/server) → SSR static markup assertion, tanpa actual DOM reflow.

## (b) Pola test server — mock `execFile` / `systemRun` via dependency injection parameter `Run`

Pattern umum: fungsi kolektor menerima **callback implikasi command runner sebagai parameter pertama**, test menggantikan callback itu. Tidak ada spy pada `execFile`; yang diuji adalah *perilaku kolektor*, bukan pemanggilan child process.

- `collectSnapshot(async (file, args) => {...})`, `collectTaskBoard(fn)`, `collectCalendar(fn)`, `collectActivity(fn)`, `collectKnowledge(fn)`, `collectUsage(days, profiles, fn)`, `collectLogs(fn)`, `collectTaskDetail(id, fn, board?)`, `collectAgentActivity(profiles, fn)`, `parseChannelStatus(str)`.
- Callback tanda tangan: `(file, args: string[]) => string | Promise<string>` — `args` adalah argumen CLI yang *seharusnya* diteruskan ke `hermes`, sehingga test bisa assert urutan/detail command.

**`mission-control.test.ts` — contoh:**
- `it('extracts profile, model and gateway state from the profile table')`: snapshot input string literal, assert output parser.
- `it('makes structured unavailable results when a read fails')`: `collectSnapshot(async () => { throw new Error('not found') })` → expect `{ availability: 'unavailable', data: [], error: { code: 'COMMAND_FAILED' } }`.
- `it('uses the default profile gateway state without invoking a separate default gateway command')`: mock collectSnapshot mencatat `calls: string[][]`, assert `calls.filter(call => call.includes('gateway')).toEqual([])` — **regresi preventif untuk query yang tidak perlu** (query redundan = latency).
- `it('never passes an option-like profile name to hermes')`: profile `--evil` diinject lewat `profile list`; assert `calls.flat()).not.toContain('--evil')`.
- `it('treats unrecognized profile output as unavailable')`: output parser ambigu (misal "Hermes profile service is starting.") → source ditandai `unavailable`, bukan crash.
- `it('keeps the other profiles when one cron list fails, and names the failed one')`: `collectCalendar` mock melempar `Error('boom')` hanya saat `args[1] === 'research'` → `calendar.jobs.data` tetap panjang 2, `calendar.failedProfiles === ['research']`.
- `it('keeps the other boards when one cannot be read, and falls back without boards')`: partial failure per board + fallback legacy path (tanpa `--board`).
- `it('adds up every profile, ranks agents and keeps the rest when one fails')`: `collectUsage` aggregate total token across profiles, satu profile `broken` tetap tersedia di list dengan `availability: 'unavailable'`, total tetap dihitung dari yang sukses.

**`access.test.ts` — contoh:**
- `beforeEach`: create tmp dir, `new AccessStore(dir)`, `installAccess(app, store, new Throttle())`, mount `/api/health` + `/api/secret`, listen port 0; `afterEach` close server. → isolasi penuh tiap test.
- `it('is off by default and leaves every route open')`: assertion status 200 tanpa akses.
- `it('rejects short codes, cross-site posts and repeated guessing')`: single test coverage gabungan — minLength 12 (400), absent `x-ruang-request` header (403), 5x attempt gagal (401), attempt ke-6 throttled (429) + `retry-after: 1`.
- `it('stays locked when the stored file is damaged')`: inject `writeFile(dir, 'not json')` → tetap 401, lalu `new AccessStore(dir).clear()` → 200 (recovery path).

Pola setup: **port dinamis → `fetch`/`express` route fixture → `afterEach` cleanup**; pola assert: **status code, header cookie, file permission (0o600), content redaction**.

## (c) Pola test frontend

Semua frontend test di-node, SSR/static-markup assertion:

- **`office-detail.test.tsx`** — *test markup/a11y*: assert `role="dialog"`, `aria-modal="true"`, `aria-label="Close coder details"`, dan **redaction** (`not.toContain('>LA<')` dll — avatar tokens tidak dicetak).
- **`office-dialog-focus.test.tsx`** — *test DOM + fokus aksesibilitas*: `document.body.appendChild(...)`, `createRoot(host)` render `Office` dengan `fetch` di-mock via `vi.stubGlobal`, mock KeyboardEvent `Tab`/`Shift+Tab`/`Escape`, assert `tab.defaultPrevented === true`, `document.activeElement` wrap-around (last → Close → last), restore trigger after Escape. `afterEach` unmount + clear body + unstub globals.
- **`access.test.tsx`** (client access code) — *test logika + markup*: `generateCode()` regex + deterministik seed, `codeFileText()` redaktur path, `accessRequest()` mock `fetch` → assert header `x-ruang-request: 1` + parsing error message.
- **`pending-state.test.tsx`** — *test state loading UI vs error states*: `<Stats dashboard={null} pending/>`, `<Agents runtime={null} pending/>`, `<Office/>` (pending default) → assert `toContain('Loading')`, `not.toContain('Not Available')` / `Unknown` / `0 active work` / `No declared idle presence`. **Mencegah "empty room" / "0 active work" terlihat saat pending.**
- **`access.test.tsx`** (LockScreen/Settings) — *test markup unlock screen*: `toContain('Enter access code')`, `Remember this device for 7 days`, `LOCK THIS BROWSER`.
- **`usage.test.tsx`** — *test logika helper + UI label*: `sourceLabel` / `formatCost` (0.0123 → `$0.0123`, 27.584 → `$27.58`, undefined → `—`), markup `TOKEN USAGE · LAST 7 DAYS` + tabs `24H/7D/30D`.
- **`api-version.test.ts`** — *regresi sync version*: `expect(uiVersion).toBe(serverVersion)` (stale server detection).
- **`office-state.test.ts`** — *pure logic badge mapping*: `officeBadge` availability→label/tone, `officeStateBadge` whitelist state.
- **`request-state.test.ts`** — *pure logic error handling*: `loadSnapshot` reject/403/404/503 → `{ status: 'failed', httpStatus, message }`.
- **`routing-and-refresh.test.ts`** — *pure logic*: hash routing round-trip, `mergeRefresh({ status:'ready', data:1 }, { status:'failed' }) === { status:'ready', data:1, stale:true }` (cache-freshness policy).
- **`lounge-layout.test.ts`** — *pure logic CSS*: baca `styles.css` via `readFileSync`, regex rule `.lounge .lounge-seat-N { left: X% right: auto }` — distinct placement per seat.
- **`office3d-layout.test.ts`**, **`cron-calendar.test.ts`** — *pure logic*, no DOM.

Kategori: DOM+fokus (1 file), SSR markup + a11y (2 file), pure logic (sisanya). **Tidak ada integration test ke browser, tidak ada screenshot/visual regression test.**

## (d) Test partial failure (satu sumber gagal, response tidak jatuh semua)

**Ada, dan ini ciri khas terpenting suite ini:**

1. **`mission-control.test.ts`** — `collectCalendar`: `it('keeps the other profiles when one cron list fails...')` → partial profiles.
2. **`hermes-formats.test.ts`** — `collectTaskBoard` partial board + fallback legacy; `collectUsage` aggregate across profiles dengan `broken` tetap `unavailable` tapi total dihitung.
3. **`request-state.test.ts`** — `loadSnapshot` per-endpoint: reject vs 403/404/503 masing-masing → status `failed` + pesan actionable (tidak `throws` mentah).
4. **`routing-and-refresh.test.ts`** — `mergeRefresh`: refresh gagal → keep last good data + `stale: true`; `pending` + gagal → `status: 'failed'`.
5. **Server side** (`task-detail.test.ts`): `collectTaskDetail('t_1', ...)` → `{ availability: 'unavailable' }`, bukan crash.

Tapi **tidak ada test end-to-end** yang memverifikasi satu API endpoint return 5xx sementara endpoint lain 200 dalam satu refresh. Partial failure ditest per-sumber, bukan secara gabungan.

## (e) Regresi prevention — pola test untuk bug yang pernah terjadi

### 1. Redaction / privacy (paling banyak test)
- `server/hermes-formats.test.ts:165` — `parseCronJobs` tidak boleh memunculkan `sk-live`.
- `server/task-detail.test.ts:32` — body task tidak boleh mengandung token `abcdefghijklmnopqrstu`; `:33` `worker_pid` dihapus; `:24` home path dipendekkan jadi `worktree @ ~/work/alerts`.
- `server/hermes-formats.test.ts:310-313` — `redactLogLine` buang bearer token / `api_key=` / bot token: `not.toMatch(/abcdefghijklmnop|sk-proj|FAKE_BOT/)`.
- `server/access.test.ts:54-55` — kode tidak pernah tersimpan polos; file permission `0o600`.
- `server/memory.test.ts:48-49` — serialized memory snapshot tidak boleh contain `sk-live` / `SECRET=1`; `.env` dibaca sebagai `kind: 'sensitive'`.
- `server/profile-lock.test.ts:42-43` — PIN tidak tersimpan polos; `:119-136` — `'Secret plan'`, `'secret soul'`, `'secret line'` hilang dari output `redactOffice`/`redactTasks`/`redactCalendar`/`redactMemory`/`redactLogs`.
- `server/activity-folders.test.ts:156-165` — `.env` = sensitive, `.bin` = binary, symlink keluar → 403, `../` traversal → 403.
- `src/office-detail.test.tsx:42-44` — avatar tokens (`>LA<`, `>LE<`, `>OC<`) tidak dicetak.

### 2. Rate limiting / throttling / brute-force
- `server/access.test.ts:83-92` — kode pendek → 400, POST tanpa `x-ruang-request` → 403, 5× tebakan gagal → 401, attempt ke-6 → **429 + `retry-after: 1`**.
- `server/access.test.ts:63-67` — session cookie: `Max-Age=604800` (remember 7 hari), `Max-Age=0` saat lock, `HttpOnly; SameSite=Strict`, **tanpa** `Max-Age` untuk session sementara.
- `server/profile-lock.test.ts:80-91` — 6-digit PIN; 5× gagal → 429 "Try again in 1 s"; `Throttle` escalation: 9× fail → `waitMs = 16_000` ms, 10× → `3_600_000` ms (hard lock 1 jam).

### 3. Caching / staleness
- `src/routing-and-refresh.test.ts:19-25` — `mergeRefresh`: gagal → `{ status:'ready', data:<last good>, stale:true }`; `pending` + gagal → `status:'failed'`; sukses baru → `stale` hilang.
- `server/mission-control.test.ts:179-185` — input office yang stale (`fetchedAt` 2 menit lalu) → semua station `Unknown`, bukan data basi.
- `src/api-version.test.ts:6-8` — UI version == server version supaya server lama terdeteksi.

### 4. Query redundan & CLI injection
- `server/mission-control.test.ts:52-64` — gateway state hanya dari `profile list`, **tanpa** per-profile gateway command (`calls.filter(...)` kosong).
- `server/mission-control.test.ts:265-273`, `server/task-detail.test.ts:43-46`, `server/activity-folders.test.ts:42` — nama profile/board/task bergaya option (`--evil`, `--all`) ditolak sebelum sampai CLI.

### 5. UI regression
- `src/pending-state.test.tsx` — saat pending harus `Loading`, **dilarang** muncul `Not Available` / `Unknown` / `0 active work` / `No declared idle presence`.
- `src/lounge-layout.test.ts` — setiap kursi Lounge punya `left`/`right` eksplisit dan distinct; tidak ada `@import` HTTP.

## (f) Estimasi effort menjalankan test suite

- **Jumlah file test: 19** — 12 file di `src/`, 7 file di `server/`.
- **Jumlah `it()`: 129** (terbesar: `server/mission-control.test.ts` 28, `server/hermes-formats.test.ts` 23, `src/office3d-layout.test.ts` 16, `server/activity-folders.test.ts` 15).
- **Yang perlu di-setup:** `node >=20` (sudah ada, v26.7.0 di WSL) + `npm install`. Tidak butuh Hermes CLI, credential, atau env var — semua command runner di-mock dan semua filesystem test memakai `mkdtemp` di `tmpdir()`.
- **Estimasi durasi:** ~1–3 detik total. 16 dari 19 file adalah test logika murni tanpa I/O; 2 file (`server/access.test.ts`, `server/profile-lock.test.ts`) membuka HTTP server ephemeral; `server/activity-folders.test.ts` menulis ~650 file di tmp. Tidak ada timer sleep nyata (throttle dites via `Throttle.fail()`/`waitMs()` dengan waktu injeksi, bukan menunggu).
- **Perintah:** `npm install && npm test` (`vitest run`), atau `npx vitest run src/` untuk hanya frontend.

## Rekomendasi prioritas

1. **Tambah test partial-failure lintas-endpoint** — satu `loadSnapshot`/`fetch` round di mana endpoint A 503 dan endpoint B 200, lalu assert data A-B tetap tampil dengan failed indicator. Ini celah terbesar: (d) hanya menguji partial failure per-sumber, tidak end-to-end.
2. **Perluas jsdom ke file test interaksi** — `office-detail.test.tsx` sekarang pakai `renderToStaticMarkup`, jadi tidak bisa mendeteksi regresi event handler/fokus. Naikkan `// @vitest-environment jsdom` ke file lain yang punya interaksi (LockScreen, Settings), atau upgrade ke `createRoot` + act() agar bisa dispatch event.
3. **Cek coverage command runner** — semua test server menguji collector yang menerima DI callback. Kalau ada entry point yang memanggil `execFile`/`systemRun` langsung (bukan lewat collector), tidak ada test yang memverifikasi argumen default-nya. Cari dengan `grep -r "execFile\|systemRun\|spawn" server/ --include="*.ts" | grep -v test`.