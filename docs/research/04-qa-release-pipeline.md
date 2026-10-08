# 04 — QA & Release Pipeline (Ruang v0.2.0)

Riset statis terhadap <https://github.com/yugienugraha/ruang> (lokal: `/home/basrenk/projects/ruang`, tidak di-build/di-install).
Fokus: test coverage, build pipeline, model rilis, keamanan build, kompatibilitas WSL2, dan gap untuk pola `roomoff` (backend Elysia).

## 1. Coverage test

Runner: `vitest` via `npm test` → `vitest run` (`package.json:29`). Environment jsdom dipakai eksplisit per-file lewat pragma `// @vitest-environment jsdom` (`src/office-dialog-focus.test.tsx:1`), bukan global config — file lain berjalan di node environment default.

**19 file test** (7 di `server/`, 12 di `src/`):

### Server (domain logic + keamanan)
| File | Yang di-assert |
|---|---|
| `server/mission-control.test.ts` | Parser output CLI Hermes: `parseProfiles`, `parseGatewayStatus` (precedence 'Stopped' atas teks 'active', `:30-33`), `parseChannelStatus`, `parseSessions`, `parseSkills`; collector gagal → `{availability:'unavailable'}` terstruktur (`:35-39`); office snapshot (managed-idle, attribusi Kanban per-assignee, overlay eksplisit dengan expiry `:225-233`); calendar lintas profil (satu profil gagal → `failedProfiles` diisi, yang lain tetap `:255-263`); guard arg injection `--evil` tidak pernah diteruskan ke `hermes` (`:265-273`) |
| `server/memory.test.ts` | `parseMemorySettings` (fallback default), `parseEntries` delimiter `§` multiline; `collectMemory` baca SOUL/MEMORY/USER/AGENTS dari home sementara; **redaction**: `.env` tidak ikut terbaca, `sk-live` tidak ada di JSON snapshot (`:48-49`) |
| `server/activity-folders.test.ts` | `parseRecentActivity` (chat/cron/tools/noise); `collectAgentActivity` (missing log = quiet, `--evil` ditolak `:42`); `resolveAgentFolders` (HERMES_HOME variasi, symlink escape → 403 `:162-165`, `../` traversal ditolak); `readFolderFile` redaksi (`config.redactions === 1`, `.env` = kind sensitive, content undefined `:158-160`); daftar folder capped 500 + truncated flag (`:178-188`) |
| `server/access.test.ts` | HTTP test Express nyata di port 0: access code off by default; set code → route terkunci 401 tapi `/api/health` tetap 200 (`:49`); **hanya hash tersimpan** (`saved not.toContain(CODE)`, `:54`), file mode 0600 (`:55`); remember 7 hari (Max-Age=604800) dan lock lagi; ganti code perlu current code & mengakhiri session lama; tolak code pendek (400), CSRF via header wajib (`x-ruang-request`, forged = 403 `:85-86`), throttling brute-force (429 + retry-after `:88-91`); file corrupt → tetap terkunci (fail-closed `:94-99`); token signed + expiry + secret berbeda → invalid (`:112-120`) |
| `server/profile-lock.test.ts` | Setup PIN (hanya hash, mode 0600 `:41-43`, PIN pendek 400, agent `--evil` 400); unlock per-browser per-agent via cookie signed 15 menit (`:100-108`); throttle 5 gagal → tunggu 1 s, 10 gagal → kunci 1 jam (`:80-91`); CSRF forged 403, file corrupt → semua agent dianggap terkunci (`all: true`, fail-closed `:93-98`); **redaction**: `redactOffice/Tasks/Calendar/Memory/Logs` mengganti judul tugas/job/nama file jadi `🔒 Private`/`PRIVATE_TASK` dan JSON tidak memuat isi private (`:115-139`); pencocokan nama case-insensitive + alias opencode (`isHidden('CODER')`, `'open-code'`, `:137-138`) |
| `server/hermes-formats.test.ts` | Fixture presisi format `hermes_cli` (tabel profil, blok cron, tabel Rich skills dengan baris continuation `:198-202`, sessions 2 layout); parsing aman: `parseTasks` hanya field aman, `body` dibuang (`:93-102`); path home dipendekkan, `db_path` tidak bocor (`:133`); error cron tidak diekspos (`sk-live` absent, `:165`); `redactLogLine` menyensor Bearer/api_key/token (`:310-313`); collectUsage per profil, satu gagal → yang lain tetap (`:277-291`); CommandError `TIMEOUT`/`COMMAND_FAILED` dipetakan ke availability (`:315-325`) |
| `server/task-detail.test.ts` | `parseTaskDetail` normalisasi payload `kanban show --json`: token di body di-redact (`:32`), `worker_pid` dibuang (`:33`), path dipendekkan; id/board mirip flag (`--all`) ditolak (`:43`, `:46`) |

### Client (UI, mayoritas renderToStaticMarkup — tidak ada browser penuh)
| File | Yang di-assert |
|---|---|
| `src/api-version.test.ts` | `API_VERSION` UI === server (deteksi server basi) |
| `src/access.test.tsx` | `generateCode` deterministik dengan RNG disuntik; `codeFileText`; `accessRequest` menyertakan header `x-ruang-request`; render LockScreen/Settings |
| `src/office-detail.test.tsx` | `role="dialog"`, `aria-modal`, `aria-label` tutup; karakter piksel dirender tanpa membocorkan token avatar (`:42-44`) |
| `src/office-dialog-focus.test.tsx` | Satu-satunya test interaktif (jsdom + createRoot + act): focus trap Tab/Shift+Tab wrap, Escape menutup dan mengembalikan fokus ke trigger (`:31-47`) |
| `src/office-state.test.ts` | Mapping badge → {label, tone} hanya untuk state yang diizinkan |
| `src/routing-and-refresh.test.ts` | Hash routing round-trip + fallback; `mergeRefresh` mempertahankan data lama dengan flag `stale` saat refresh gagal; urutan kolom Kanban |
| `src/request-state.test.ts` | `loadSnapshot` memetakan reject/non-OK ke pesan actionable per status (503/404/403) |
| `src/pending-state.test.tsx` | Halaman menampilkan 'Loading', bukan placeholder `Not Available`/`Unknown` saat pending |
| `src/usage.test.tsx` | `sourceLabel`, `formatCost`, render TokenUsage (periode 24H/7D/30D) |
| `src/cron-calendar.test.ts` | `cronField` (star/list/range/step, input tak valid → undefined); OR rule dow/dom cron; interval diringkas; paused tidak dijadwalkan tapi last-run tetap tampil |
| `src/office-detail.test.tsx` / lainnya | — |

### Temuan khusus (cache / partial failure / redaction)
- **Caching**: cache layer ada di `server/mission-control.ts:980-1015` (`cachedSource`, TTL 10 s, insights 60 s, logs 5 s; in-flight dibagi). **Tidak ada unit test yang langsung menguji `cachedSource`/TTL** — gap coverage nyata. Yang teruji hanya perilaku turunan: `mergeRefresh` stale-flag di client (`src/routing-and-refresh.test.ts:19-24`) dan freshness snapshot memengaruhi state office (`server/mission-control.test.ts:179-185`, snapshot basi → `Unknown`).
- **Partial failure**: teruji kuat — board gagal satu (`failedBoards`, `server/hermes-formats.test.ts:138-156`), profil cron gagal (`failedProfiles`, `server/mission-control.test.ts:255-263`), usage satu profil gagal (`:277-291`), logs per-file (`server/hermes-formats.test.ts:315-325`).
- **Redaction**: teruji di banyak lapis — regex `SECRET_PATTERNS` (`server/mission-control.ts:404-408`, mencakup sk/pk/ghp/glab/AKIA, Bearer, pola key=value, token Telegram), dites di `server/hermes-formats.test.ts:310-313` dan `:165`; `.env`/secret file menolak dibaca (`server/activity-folders.test.ts:158-160`); privacy layer profile-lock dites penuh (`server/profile-lock.test.ts:111-139`).

### Estimasi coverage
- **Kuat**: parser/collector murni (mission-control), security stores (access, profile-lock), folder safety (traversal/symlink/redaction), util client kecil (routes, request-state, cron-calendar, office-state).
- **Ringan**: komponen React diuji via `renderToStaticMarkup` (snapshot string) — tidak ada interaksi selain satu test focus dialog; halaman yang tidak tersentuh test: Folders, Logs, Knowledge/Memory page, TaskBoard page, Settings (sebagian), scene3d (`src/scene3d/` tanpa test sama sekali), `server/index.ts` (bootstrap express/route wiring) tanpa test integrasi route.
- **Gap utama**: (1) cache TTL & clearSnapshotCache tidak diuji; (2) tidak ada test end-to-end jalur nyata `hermes` CLI (semua runner di-mock via parameter `run`, bagus untuk unit tapi tidak memverifikasi format CLI terbaru); (3) scene3d & routing antar-halaman; (4) `bin/ruang.js` (arg parsing, access-code/profile-lock CLI) tidak ada test.
- Persentase tidak diklaim (tidak ada konfigurasi coverage threshold di repo — tidak ada `vitest.config` dengan `coverage`, jadi `npm test` tidak mengukur coverage sama sekali).

## 2. Build pipeline

`npm run build` = `tsc -b && vite build && tsc -p tsconfig.server.build.json` (`package.json:26`) — tiga tahur urut:

1. `tsc -b` — project references (`tsconfig.json:1-4` → `tsconfig.app.json` + `tsconfig.server.json`), type-check; `noEmit` untuk mode dev (tsbuildinfo di `node_modules/.tmp`).
2. `vite build` — bundle client React → **`dist/`** (default vite outDir).
3. `tsc -p tsconfig.server.build.json` — compile server → **`build/server/`** (`tsconfig.server.build.json:6-7`), `rootDir: server`, `exclude: server/**/*.test.ts` (test tidak ikut rilis, `:10`).

`package.json` `files: ["bin", "build/server", "dist"]` (`package.json:14-18`) — hanya artefak build + bin yang masuk tgz.

Bootstrap `bin/ruang.js`:
- Baca versi dari `../package.json` relatif modul (`bin/ruang.js:5`).
- Subcommand `access-code` / `profile-lock` → dynamic `import('../build/server/access.js' | 'profile-lock.js')` dengan guard `existsSync` → pesan "Ruang is not built. From a source checkout, run: npm run build" (`bin/ruang.js:33-34`, `:57-58`).
- Arg `--port` divalidasi integer 1..65535 → `RUANG_PORT` (`:80-86`); entry utama: `await import('../build/server/index.js')` (`:91-96`).
- Model: satu binary entrypoint ESM yang hanya membaca hasil build; dev pakai `tsx watch server/index.ts` + vite HMR (`package.json:23-25`).

## 3. Model rilis

- Versi `0.2.0` (`package.json:3`), rilis ditandai tag `v*` → GitHub Actions `.github/workflows/release.yml:8-9`.
- Guard konsistensi tag↔package.json: `test "v$(node -p ...version)" = "$GITHUB_REF_NAME"` (`release.yml:27`) — rilis gagal kalau lupa `npm version`.
- Urutan: `npm ci` → lint → test → build → `npm pack` → rename ke `ruang.tgz` → `gh release create <tag> ruang.tgz` (`release.yml:28-39`). npm publish opsional, hanya jika secret `NPM_TOKEN` ada (`:40-44`).
- `install.sh` mengunduh **tgz dari GitHub Releases**, bukan npm: URL `https://github.com/$REPO/releases/latest/download/$PACKAGE.tgz` atau `releases/download/$version/$PACKAGE.tgz` untuk `--version v0.2.0` (install.sh:124-127). Jika rilis belum ada → fallback build from source via `git clone --depth 1` (install.sh:131-145). Opsi lain: `--tarball` (file lokal atau URL) dan `--from-source`.
- **Old names**: fungsi `remove_previous_names()` (install.sh:192-209) membersihkan instalasi lama `mission-control` (folder `.local/share/mission-control`) dan `majujaya` (`pt-ai-maju-jaya`) — hanya jika launcher mengandung marker instalernya sendiri (`grep -q "$marker"`), lalu disable systemd unit lama dan hapus folder + launcher. README menyatakan hal yang sama (`README.md:31`). Nama lama masih muncul sebagai keyword npm (`package.json:61`) dan nama internal modul `server/mission-control.ts` tidak di-rename (kompatibel, kosmetik).

## 4. Keamanan build & instalasi

- **Secret scanning**: TIDAK ada di CI (`ci.yml` dan `release.yml` tidak memakai gitleaks/deteksi secret). Redaction runtime (`redactLogLine` dan `SECRET_PATTERNS`) melindungi output yang ditampilkan, bukan repo. Tidak ada code signing (npm publish tanpa sigstore/provenance `id-token: write`), tidak ada attestasi build.
- **Integrity**:
  - Private Node.js yang diunduh installer diverifikasi via `SHASUMS256.txt` + `sha256sum -c` (install.sh:96-104) — bagus.
  - **Paket `ruang.tgz` TIDAK diverifikasi** — tidak ada checksum/signature yang dicetak di release; user mempercayai TLS GitHub saja.
  - `npm ci` di CI memakai `package-lock.json` (reproducible), tapi release workflow tidak mengunci dependensi runtime di luar itu.
- **Risiko `curl | bash` dari raw.githubusercontent**: instalasi dieksekusi langsung sebagai user tanpa sudo; script dapat berubah setiap saat di branch `main` (tidak di-tag/dipinned), sehingga audit satu kali tidak menjamin isi eksekusi berikutnya. `download()` memakai `curl --proto '=https' --tlsv1.2 --retry 3` (install.sh:60-62) — mitigasi transport, bukan konten. Mitigasi yang disarankan README: download dulu, baca, jalankan (`README.md:31`). Untuk penggunaan produksi: pin commit/tag (`https://raw.githubusercontent.com/.../<tag>/install.sh`), cocokkan checksum tgz secara manual, atau pakai `--tarball` dengan paket yang sudah diverifikasi.
- Runtime security sudah kuat dan teruji: bind hanya `127.0.0.1` (ditegaskan di help `bin/ruang.js:29`), akses opsional via access code hashed (argon/bcrypt tidak diverifikasi di riset ini — hanya disimpulkan dari "only stores a hash"), cookie HttpOnly+SameSite=Strict, throttling brute-force, fail-closed pada file rusak.

## 5. Kompatibilitas WSL2 — checklist verifikasi sebelum dipakai

1. **Node >= 20** di PATH WSL (`engines`, `package.json:19-21`); kalau tidak ada, installer mengunduh Node 22 privat ke `~/.local/share/ruang/node` (install.sh NODE_MAJOR_PRIVATE=22) — jalur Linux, aman di WSL.
2. **`hermes` CLI di PATH** — server memanggil `hermes` via `execFile` (systemRun di `server/mission-control.ts`); tanpa CLI semua panel jadi `unavailable` (bukan crash — diuji fail-closed). Verifikasi: `command -v hermes && hermes profile list`.
3. **Port binding 127.0.0.1** — default 3001 atau `RUANG_PORT`; pastikan tidak bentrok dengan service Windows yang di-forward, dan akses browser Windows ke `http://127.0.0.1:3001` (WSL2 localhost forwarding) berfungsi.
4. **systemd user service** (`--service`): WSL2 default tanpa systemd aktif — perlu `systemd=true` di `/etc/wsl.conf` + `wsl --shutdown`; tanpa itu jalankan manual / via tmux.
5. Filesystem: `~/.hermes` berada di FS Linux — hindari letakkan di `/mnt/c` (I/O 9p lambat untuk banyak file kecil saat list folder/memory).
6. `HOME`, `~/.local/bin` di PATH untuk perintah `ruang`.

## 6. Gap list: pola ruang → roomoff (Elysia)

**Bisa langsung copy-paste / adaptasi minim:**
- Seluruh test fixture parser & kontrak data (`server/hermes-formats.test.ts`, `server/mission-control.test.ts`, `server/task-detail.test.ts`) — asersi murni di atas fungsi parser, framework-agnostic. Pindah ke vitest tetap sama.
- `server/privacy.ts` + `server/profile-lock.ts` store (hash file, token signed, throttle) — logika murni Node; hanya middleware-nya yang Express-specific (`installAccess(app, ...)` memakai `app.use`, req/res Express).
- `redactLogLine` / `SECRET_PATTERNS` (`server/mission-control.ts:404-408`) — salin utuh.
- `server/folders.ts` traversal/symlink guard — murni `node:fs`, tidak terikat framework.
- `bin/ruang.js` bootstrap pattern (guard existsSync, dynamic import, arg parsing) — salin utuh, hanya ganti path output build.
- Build pipeline 3 tahur: type-check → vite client → tsc server; terjemahan: ganti `tsconfig.server.build.json` output Elysia → `build/server`, `tsc -b`/`vite` tetap.
- Workflow GitHub `ci.yml`/`release.yml` — pola tag↔version guard, `npm pack` + `gh release create`, smoke test instal global dari tgz (`ci.yml:25-30`): ganti command smoke test.

**Perlu adaptasi (Express → Elysia):**
- Middleware access code & profile lock (`installAccess`, `installProfileLock`): di Elysia pakai `derive`/`onBeforeHandle` + `app.guard`, cookie via `Elysia#cookie`, bukan `req.headers.cookie` manual. Uji HTTP-nya tetap bisa dengan `app.handle(new Request(...))` tanpa listen nyata (lebih ringan dari listen(0) di test Express).
- CSRF check `x-ruang-request` — pola sama, implementasi via header guard Elysia.
- Test Express `app.listen(0)` + fetch (`server/access.test.ts:15-26`) → ganti dengan `app.handle()`; pertahankan sertifikasi status code/cookie identik.
- `@types/express` → `@types/bun` atau types Elysia; vitest environment tetap.

**Gap roomoff yang harus dibuat sendiri (ruang tidak menyediakan):**
- Secret scanning CI (mis. gitleaks) dan checksum/signature untuk tgz rilis — ruang sendiri tidak punya; jangan tiru kelemahannya.
- Test untuk cache TTL — kalau roomoff memakai cache, tulis test-nya sejak awal (ruang melewatkannya).
- Coverage threshold di vitest config (ruang tidak mengukur coverage sama sekali).
- Jika backend Elysia target runtime Bun: keputusan build (tsc vs bun build) berbeda — pola `tsc -p server` tetap bisa, tapi verifikasi `bun` vs `node` sebagai engine di `engines` field dan di install.sh `ensure_node`.

## 7. Referensi path utama
- Test: `server/{mission-control,memory,activity-folders,access,profile-lock,hermes-formats,task-detail}.test.ts`, `src/*.test.{ts,tsx}` (19 file).
- Build: `package.json:26`, `tsconfig.json`, `tsconfig.server.build.json:6-10`, `bin/ruang.js:91-96`.
- Rilis: `.github/workflows/{ci.yml,release.yml}`, install.sh (raw, fungsi `fetch_package` baris 113-151, `remove_previous_names` baris 192-209).
- Keamanan: `server/mission-control.ts:404-413`, `server/access.ts`, `server/profile-lock.ts`, `server/privacy.ts`.
