# Ruang — Kontrak API & Audit Keamanan

Sumber: `ruang/server/index.ts`, `access.ts`, `profile-lock.ts`, `privacy.ts`, `folders.ts`, `memory.ts`, `mission-control.ts`.
API_VERSION = 12 (`server/api-version.ts:2`). Host `127.0.0.1` (index.ts:13). Port `RUANG_PORT` → `MISSION_CONTROL_PORT` → 3001 (index.ts:15).
Semua response JSON. Snapshot di-cache 10 s (`CACHE_MS`, mission-control.ts:5). Query `?fresh=1` menambah 8 s ke `now` sehingga cache 10 s terlewati (index.ts:36,52,58).

## (a) Endpoint — 28 route

Semua di bawah `/api`, header `Cache-Control: no-store` (index.ts:22-25). Field bertanda `?` opsional.

### Health & access code (tanpa session)

| # | Method | Path | Query | Response |
|---|---|---|---|---|
| 1 | GET | `/api/health` | — | `{ok: true, apiVersion: number, startedAt: ISO8601}` |
| 2 | GET | `/api/access` | — | `{enabled: boolean, unlocked: boolean, since?: ISO8601, minLength: 12, rememberDays: 7}` |
| 3 | POST | `/api/access/unlock` | — | status access + `unlocked: true`; body wajib `{code: string, remember?: boolean}` |
| 4 | POST | `/api/access/lock` | — | `{enabled, unlocked: !enabled}`; cookie di-clear `Max-Age=0` |
| 5 | POST | `/api/access/code` | — | `{enabled: true, unlocked: true, since, minLength, rememberDays}`; body `{code: string, currentCode?: string, remember?: boolean}` |
| 6 | POST | `/api/access/disable` | — | status access; body `{currentCode: string}` |

### Profile lock (tanpa session unlock)

| # | Method | Path | Body wajib | Response |
|---|---|---|---|---|
| 7 | GET | `/api/profile-lock` | — | `{enabled: boolean, agents: string[], unlocked: string[], pinLength: 6, unlockMinutes: 15}` |
| 8 | POST | `/api/profile-lock/setup` | `{pin: "6 digit", agents: string[]}` | status lock; 409 bila sudah aktif |
| 9 | POST | `/api/profile-lock/update` | `{pin}` + `{agents?}` / `{newPin?}` | status lock |
| 10 | POST | `/api/profile-lock/disable` | `{pin}` | status lock |
| 11 | POST | `/api/profile-lock/unlock` | `{agent: string, pin}` | status lock; set-cookie `ruang_profiles` |
| 12 | POST | `/api/profile-lock/lock` | `{agent?}` | status lock; token dihapus (tanpa agent = semua) |

### Snapshot

| # | Method | Path | Query | Response (field wajib) |
|---|---|---|---|---|
| 13 | GET | `/api/runtime` | `?fresh=1` | `{profiles: {availability, data: [{name, model, gateway}]}, openCode: {availability, data}, fetchedAt}` |
| 14 | GET | `/api/dashboard` | `?fresh=1` | `{runtime, tasks: {availability, total, byStatus, assigned}, calendar: {availability, total, active, paused, nextRun?}, activity: {availability, total, latest?}, knowledge: {availability, total, byCategory}, channels: {availability, total, connected, activeSessions?}, office: summary, commands: health, fetchedAt}` |
| 15 | GET | `/api/tasks` | `?fresh=1` | `{tasks: {availability, data: Task[]}, boards?: [{slug, name, current, total}], failedBoards?, fetchedAt}` |
| 16 | GET | `/api/calendar` | `?fresh=1` | `{jobs: {availability, data: ScheduledJob[]}, failedProfiles?, fetchedAt}` |
| 17 | GET | `/api/activity` | `?fresh=1` | `{sessions: {availability, data: Session[]}, fetchedAt}` |
| 18 | GET | `/api/knowledge` | `?fresh=1` | `{skills: {availability, data: Skill[]}, fetchedAt}` |
| 19 | GET | `/api/office` | `?fresh=1` | `{stations: OfficeStation[], summary, fetchedAt}` — tiap station `{id, name, role, room, roomPosition, state, currentTask, recentActivity, activity, seat, provenance, freshness, privacy?}` |
| 20 | GET | `/api/channels` | `?fresh=1` | `{channels: {availability, data: [{name, status}]}, activeSessions?, fetchedAt}` |
| 21 | GET | `/api/logs` | `?fresh=1` | `{files: [{name, label, source: {availability, data: [{text, level}], error?}}], fetchedAt}` |
| 22 | GET | `/api/command-log` | `?fresh=1` | `{entries: [{command, ok, durationMs, at, error?}], health: {total, failed, averageMs}, fetchedAt}` |
| 23 | GET | `/api/usage` | `?days=N` (default 7), `?fresh=1` | `{days, agents: [{agent, availability, usage?, error?}], totals: {sessions, messages, toolCalls, inputTokens, outputTokens, totalTokens, costUsd?}, models, sources, tools, fetchedAt}` |
| 24 | GET | `/api/tasks/:id` | `?board=slug` | `{task: {data: Task, ...}}`; 404 `{error: "Unknown task."}`; 423 `{error, locked: 'profile', agent}` |
| 25 | GET | `/api/memory` | — | `{agents: [{profile, label, path, kind: hermes\|opencode, available, reason?, soul?, memory?, user?, contextFiles, settings?, locked?}], fetchedAt}` |
| 26 | GET | `/api/folders` | — | `{agents: [{profile, label, available, path, reason?, warning?}], fetchedAt}` — `directory` server-side, dihapus oleh `publicAgent` |
| 27 | GET | `/api/folders/:profile/list` | `?path=rel` | `{profile, path, entries: [{name, path, type, size, modified, sensitive, unreadable?}], truncated, hiddenCount}` |
| 28 | GET | `/api/folders/:profile/file` | `?path=rel` | `{profile, path, size, modified, kind: text\|binary\|sensitive\|too-large, content?, truncated?, redactions?}` |

Error shape umum: `{error: string}`. `/api/*` unknown → 404 `{error: 'Not found'}` (index.ts:113). Handler throw → 500 `{error: 'Internal error'}` (index.ts:120-124).

Aktif karena flag: `/api/health`, `/api/access*`, `/api/profile-lock*` tetap hidup walau access code aktif (access.ts:236). `/api/usage` & semua route snapshot punya `?fresh=1`; `/api/tasks/:id`, `/api/folders*`, `/api/memory` tidak punya cache-bypass — `getTaskBoard()` dipanggil tanpa `now` (index.ts:64).

## (b) Privacy model — redact*

Semua redaksi **server-side, per-request**, pada salinan snapshot yang di-cache (privacy.ts:5-7).
`quiet(privacy) = !privacy.all && privacy.hidden.size === 0` (privacy.ts:14) → early-return tanpa alokasi bila tidak ada yang dikunci.
`isHidden(privacy, agent)` (profile-lock.ts:126-135): case-insensitive, alias `opencode` ↔ `open-code`, `all === true` menyembunyikan semua.

| Fungsi | Yang disembunyikan | Kapan |
|---|---|---|
| `redactOffice` (:16) | `privacy: 'locked'`, `currentTask`/`recentActivity` → `🔒 Private`, `activity` → `🔒 <state>` (Idle → "On a break", Offline/Unknown → `''`), `state` tetap | station ter-hidden; station yang locked tapi ter-unlock dapat `privacy: 'unlocked'` |
| `redactTasks` (:28) | `title` → `🔒 Private task`, `private: true` | `task.assignee` ter-hidden |
| `redactCalendar` (:33) | `name` → `🔒 Private job`, `private: true` (schedule tetap) | `job.agent ?? 'default'` ter-hidden |
| `redactActivity` (:38) | semua session: `title` → `🔒 Private session`, `preview: ''`, `workspace: undefined` | hanya agen `default` (sumber data session) |
| `redactDashboard` (:43) | `activity.latest` diisi `🔒 Private session`, preview kosong, workspace dibuang | `default` hidden + `latest` ada |
| `redactLogs` (:48) | tiap `source` → `availability: 'unavailable'`, `data: []`, `error: {code: 'LOCKED', message}` | hanya `default` |
| `redactUsage` (:53) | `usage.topSession: undefined` | `agent.agent` ter-hidden |
| `redactMemory` (:58) | agent jadi `{profile, label, path, kind, available: false, reason: '🔒 Locked', locked: true, contextFiles: []}` — SOUL/memory/user dibuang total | `agent.profile` ter-hidden |

Route yang tidak di-redact: `/api/runtime`, `/api/knowledge`, `/api/channels`, `/api/command-log` (index.ts:39,44,46,48) — isinya non-pribadi.
Folder/listing dibaca langsung dari disk dan dijaga `guardFolder` (index.ts:99-103) → 423, bukan redaksi.

## (c) Profile lock — server-side, dan risikonya

Alur: PIN 6 digit (`PIN_LENGTH`, profile-lock.ts:13) → `scrypt(N=16384,r=8,p=1,maxmem=64MB)` (access.ts:51-53) → hanya hash base64 + salt 16 B + `secret` 32 B disimpan di `~/.config/ruang/profile-lock.json` (atau `$XDG_CONFIG_HOME`/`RUANG_CONFIG_DIR`), mode `0o600`, tulis atomik tmp+rename (profile-lock.ts:65-72). PIN mentah tidak pernah ada di disk.

Unlock **server-side**: token `p1.<base64url(agent)>.<expiry>` + HMAC-SHA256(secret) (profile-lock.ts:104-107), ditaruh di cookie `ruang_profiles` (`HttpOnly; SameSite=Strict` + `Secure` bila TLS, profile-lock.ts:160-163). Validasi `unlockedAgents()` cek regex + TTL + `timingSafeEqual` (profile-lock.ts:110-120). `privacy()` per request: `hidden = locked − unlocked`, `all: true` bila file ada tapi rusak/rusak parse (profile-lock.ts:140-147) → fail-closed.

Jadi: **bukan client-side**. Yang client-side hanya label `🔒`. Cookie hanya penanda bertanda tangan; data tidak pernah dikirim ke browser dalam keadaan locked.

Risiko:
1. **PIN 6 digit = 10^6 kombinasi.** Dibatasi hanya oleh throttle in-memory (`free: 5`, `hardLimit: 10` → `hardWaitMs: 60 m`, profile-lock.ts:139) — hilang saat restart server, dan hanya per `remoteAddress`.
2. **Jendela 15 menit** (`UNLOCK_MS`, profile-lock.ts:14) membuka semua data privat agent itu per browser. Browser yang ditinggal terbuka = data bocor tanpa perlu PIN lagi.
3. **Token tidak bisa dicabut per-sesi** dari sisi server: satu-satunya pembatalan adalah ganti PIN (mengganti `secret`) atau `POST /profile-lock/lock` pada cookie itu sendiri.
4. `Throttle.entries` adalah `Map` in-memory: restart = counter reset; `entries.clear()` bila >5000 key (access.ts:141) bisa dipakai penyerang lokal untuk reset throttle orang lain.
5. Setelah `/api/profile-lock/unlock` handler memaksa `request.headers.cookie` (profile-lock.ts:227,237) agar status langsung konsisten — hanya berlaku pada object `request` saat itu, bukan-acak global.
6. `/api/tasks/:id` bocor lewat `assignee`: task detail agent ter-lock dijawab 423 (index.ts:65,69), tapi **cek hanya `assignee`**, jadi board/ID tetap terenumerate.

## (d) Access code — cookie, throttle, proteksi write

- **Cookie** `ruang_session` (access.ts:17): `Path=/; HttpOnly; SameSite=Strict` + `Secure` hanya bila `request.secure` (access.ts:159). Tanpa `remember` → **session cookie** (tanpa `Max-Age`); dengan `remember: true` → `Max-Age=604800` (7 hari, `REMEMBER_MS`). TTL token 12 jam (`SESSION_MS`) atau 7 hari bila remember (access.ts:15-16,118).
- **Token**: `v1.<expiry>.<remember?1:0>.<HMAC-SHA256(base64url)>` (access.ts:113-128); regex ketat, `Number(expiry) <= now` reject, `timingSafeEqual` untuk signature. Ganti/remove code → `secret` baru → semua sesi lama mati (access.ts:90).
- **Throttle** per `request.socket.remoteAddress` (access.ts:171,136-148): `FREE_ATTEMPTS=5`, setelah itu tunggu `1000 * 2**(failures-5)` dibatasi `MAX_WAIT_MS=5 m`. Default `installAccess` **tanpa** `hardLimit` (access.ts:166) — berbeda dari profile lock yang 1 jam. `succeed()` menghapus entri. Balas 429 + header `Retry-After` (access.ts:184).
- **Proteksi write**: `app.use('/api/access', express.json({limit:'4kb'}), …)` menolak **semua** POST tanpa header `x-ruang-request: 1` → 403 (access.ts:197-200). Idem `/api/profile-lock` (profile-lock.ts:184-187). Praktisnya anti-CSRF: custom header memicu preflight, dan Ruang tidak pernah menjawab preflight.
- **Gating**: `app.use('/api', …)` (access.ts:235-239) mengunci semua route kecuali `/health` dan `/access*` → 401 `{error, locked: true}`. Catatan: pengecualian `request.path.startsWith('/access/')` tidak mencakup `/profile-lock` — jadi bila access code aktif, seluruh API profile lock ikut 401 (harus unlock dulu). Fail-closed bila `access.json` rusak (access.ts:74,80-82).
- `generateCode()` (access.ts:34-38): alphabet tanpa `0/O/1/I`, 4×4 char + prefiks `ruang-` = 80 bit.

## (e) Static serving — kenapa 2 URL

`index.ts:18`: kandidat `new URL('../dist', import.meta.url)` (dari `server/*.ts`, dev `npm start`) lalu `new URL('../../dist', import.meta.url)` (dari `build/server/*.js`, paket terinstall). `.map(fileURLToPath).find(p => existsSync(join(p,'index.html')))`, fallback ke `../dist`.

Alasan: file yang sama dengan path relatif berbeda tergantung konteks — TypeScript langsung di repo vs hasil compile di `build/`. Satu array resolution menutup dua skenario tanpa flag/env. Syarat `index.html` ada mencegah `express.static` diam-diam menyajikan direktori kosong. SPA fallback: `app.get(/^(?!\/api\/).*/, sendFile('index.html'))` (index.ts:117) — regex negatif lookahead agar `/api` 404 JSON, bukan HTML. `express.static` default `dotfiles: 'ignore'`, jadi file titik-diekspos tidak ikut tersaji.

## (f) CORS / host binding

`app.listen(PORT, '127.0.0.1')` (index.ts:126). Tidak ada middleware CORS, tidak ada header `Access-Control-Allow-Origin`, tidak ada `helmet`, tidak ada CSRF token — semuanya tidak perlu karena browser tidak boleh read/POST lintas-origin tanpa preflight yang dijawab.

Konsekuensi:
- **Akses dari network lain**: TCP ditolak di level socket. `http://<LAN-IP>:3001` tidak connect sama sekali (bukan 403 — connection refused/timeout). Tidak ada jalur remote tanpa port-forward/SSH tunnel/proxy yang disengaja.
- **Host lama (WSL2)**: karena repo ini jalan di WSL, `127.0.0.1` di dalam WSL tidak sama dengan loopback Windows; untuk diakses dari browser Windows butuh `localhostForwarding` (default WSL2 sudah menyalakannya) — kalau dimatikan, UI tidak terbuka padahal server hidup.
- Yang tersisa sebagai risiko: **proses lokal lain**. Backdoor browser-extension, malware user-level, atau service lain di user yang sama bisa menghantam `127.0.0.1:3001` dan membaca snapshot agent tanpa kode akses kalau `access.json` belum dibuat. Port 3001 tidak raw, tapi też bukan auth boundary. Rekomendasi (bukan perubahan, hanya catatan): set access code bila mesin multi-user.
- `app.disable('x-powered-by')` (index.ts:21) buang fingerprint Express; `Cache-Control: no-store` pada `/api` mencegah data privat tersimpan di cache browser/disk.

## (g) Coverage test

`server/access.test.ts` (6+2 kasus, integrasi lewat HTTP nyata ke `app.listen(0, '127.0.0.1')` + `fetch`):
- default off & semua route terbuka (:34)
- set code → route data 401, `/api/health` tetap 200, cookie `HttpOnly; SameSite=Strict` tanpa `Max-Age`, file `0o600` dan tidak memuat code (:39)
- unlock benar/salah, `remember` → `Max-Age=604800`, lock → `Max-Age=0` (:58)
- ganti/turn-off butuh `currentCode`; sesi lama jadi 401 setelah code berubah (:70)
- code < 12 → 400; POST tanpa header → **403**; 5 tebakan salah → **429** + `retry-after: 1` (:83)
- `access.json` rusak (`not json`) → tetap 401 (fail-closed) (:94)
- helper: format `generateCode`, `normalizeCode` trim/panjang/control-char, `tokenValid` expire/forge secret/tamper flag remember (:104,112)

`server/profile-lock.test.ts` (6+2 kasus):
- off by default; PIN 4 digit & agent `--evil` → 400; setup kedua → 409; `profile-lock.json` `0o600`, tanpa PIN (:35)
- unlock per-agent, `hidden` menyusut per cookie; re-lock mengembalikan; browser tanpa cookie tetap melihat semua agent hidden (:48)
- `update` butuh PIN; ganti PIN membatalkan semua unlock; `disable` butuh PIN (:66)
- throttle: 5 gagal → 429 "Try again in 1 s"; `Throttle` murni: 9 gagal → 16 s, 10 gagal → 60 m (:80)
- cross-site POST → 403; file rusak `{oops` → `all: true` (:93)
- token per-agent: valid 60 s, invalid setelah `UNLOCK_MS`, token yang di-swap nama agent ditolak (:100)
- redaksi (privacy test di file yang sama, :111-139): office locked/unlocked/visible, title task & job (schedule tetap), memory (`locked: true`, `available: false`, `soul` hilang dari JSON), log `secret line` hilang, `isHidden('CODER')`, alias `open-code`.

Tidak ada test untuk: gating `/api/profile-lock` di balik access code, `distDirectory` resolution, header `Secure` pada path TLS, dan `/api/tasks/:id` 423 — celah test coverage.