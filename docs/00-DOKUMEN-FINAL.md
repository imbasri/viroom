# VIROOM — Dokumen Final (Master)
Proyek: **Viroom** — 3D virtual office & mission control untuk kru Hermes Agent + OpenCode.
Lokasi: `\\wsl.localhost\Ubuntu\home\basrenk\projects\viroom` = `/home/basrenk/projects/viroom`
Tanggal: 2026-10-09 · Disusun: @basrenk (CEO), riset: kru (@robin @sanji @zoro @franky @chopper @nami)

> Dokumen ini **master reference**. Sumber riset detail: `docs/research/01..06*.md`.

---

## 1. Keputusan Stack (final, dari Bang Bas)

| Layer | Pilihan | Catatan |
|---|---|---|
| Backend | **ElysiaJS (Bun)** | Express TIDAK dipakai — ruang pakai Express, kita Elysia |
| Database | **SQLite** | State persisten (room position, lock, settings) — ruang tidak punya DB, kita beda |
| Hermes CLI | Read-only source via `execFile` | Boleh baca, jangan mutasi state Hermes |
| Frontend | **React 19 + Vite + shadcn/ui + zustand** | ruang: CSS token manual tanpa shadcn — kita shadcn |
| 3D office | **@react-three/fiber + three.js** (lazy load) | Tiru ruang; 2D fallback tetap ada |
| Test | Vitest (+ jsdom per-file) | Pola DI mock `Run` parameter dari ruang |
| Runtime | Node 20+ / Bun | WSL2, bind `127.0.0.1` |

---

## 2. Ringkasan Riset (5 temuan penting per dokumen)

### 01 — Arsitektur server (pola yang WAJIB ditiru)
- **`Source<T>` wrapper** `{availability, data, error}`: satu sumber gagal → `unavailable` + fallback, tidak pernah throw ke route. UI tetap render "Not Available" per-seksi.
- **Runner `systemRun`**: `execFile` tanpa shell (anti injection), timeout 8s, maxBuffer 16MB, env `NO_COLOR/TERM=dumb/COLUMNS=200`, audit `commandLog` 100 entri.
- **Cache closure per-source**: TTL 10s (logs 5s, activity 15s, insights 60s) + **in-flight dedup** (pembaca concurrent berbagi 1 promise). `?fresh=1` = geser `now` +8s.
- **State agent dari 3 lapis bukti eksplisit** (bukan keyword guess): live activity log → kanban task assignee → session aktif. Fusi: overlay > live > task > kolab > Unknown. Idle hanya kalau semua sumber fresh ≤30s.
- **Validasi regex wajib**: `PROFILE_NAME`, `BOARD_SLUG`, `TASK_ID` — cegah opsi-injection (`--evil` lolos ke `hermes -p`). Path folder: reject `..` + resolveInside(realpath).

### 02 — API contract & keamanan (28 endpoint)
- Pola response: semua snapshot `Source<T>` + `fetchedAt`, header `Cache-Control: no-store`.
- **Redaksi server-side per-request** (privacy.ts), bukan di client: judul task/job/log → `🔒 Private` bila agent ter-lock.
- **Profile lock**: PIN 6 digit → scrypt hash di disk (0600), unlock token HMAC-SHA256 di cookie HttpOnly. *Risiko: throttle in-memory (reset saat restart), jendela unlock 15 menit*.
- **CSRF**: tolak POST tanpa header `x-ruang-request: 1` (custom header → preflight tak terjawab).
- **Gap kita**: kalau nanti di-tunnel, jangan tiru throttle in-memory → pakai SQLite counter.

### 03 — Frontend (10 route, hash routing)
- **Routing**: hash-based (`window.location.hash`), 10 halaman, default = Office. (Kita boleh pakai react-router, keputusan @zoro.)
- **`usePolling(path, 15000)`**: pause saat `document.hidden`, manual refresh `?fresh=1`. `RequestState = pending | ready(+stale) | failed`.
- **3D**: r3f; `createLayout(n)` deterministik (hot-desk, 1 meja/agen), `placementFor` (desk/meeting/lounge), `walkPath3` waypoint hindar furnitur, `idlePlan` wandering deterministik per waktu. Karakter warna = **FNV-1a hash dari nama** (konsisten antar browser).
- **Bukan shadcn/Tailwind/zustand** di ruang — CSS 803 baris. **Kita beda: shadcn + zustand.**
- Tekstur: canvas-procedural, tanpa aset eksternal. 3D lazy-loaded chunk terpisah.

### 04 — QA & release pipeline
- **19 file test / 129 `it()`** (7 server, 12 client). Client test = `renderToStaticMarkup` + 1 file DOM focus-trap (jsdom).
- Build: `tsc -b && vite build && tsc -p tsconfig.server.build.json` → `dist/` (UI) + `build/server/`.
- **Gap ruang yang JANGAN ditiru**: tanpa coverage threshold, tanpa secret scanning CI, tanpa checksum rilis, `curl|bash` unpinned. → Kita tambah gitleaks + test cache-TTL sejak awal.
- WSL2 checklist: Node≥20, `hermes` di PATH, port forwarding, systemd perlu `wsl.conf`.

### 05 — Test automation
- Pola inti: **dependency injection parameter `Run`** — collector terima callback `(file, args) => string`, test assert urutan command + perilaku (termasuk `--evil` tidak pernah diteruskan).
- Partial failure teruji kuat per-sumber; **belum ada test E2E gabungan 5xx+200 satu refresh** → kita buat.
- Rekomendasi: jalankan vitest per-file dulu (mock isolasi) sebelum full suite.

### 06 — Produk & roadmap
- **Value prop ruang**: live presence visual (state → karakter), mission control read-only 1 layar, dua lapis lock opsional.
- **Top 3 untuk ditiru (P0/P1)**:
  1. **Office 2D/3D terhubung data** (G2/G10) — state → posisi + speech bubble aktivitas + detail dialog. *Tanpa ini = dashboard biasa.* Effort **L**.
  2. **Cron multi-profile + month view** (G1) — next-run, overdue, filter per agen. Effort **M**.
  3. **Token usage per agen** (`hermes insights`) — 24j/7/30h, per model, top tools. Effort **M**.
- **JANGAN ditiru**: Express, full-scene 3D dekoratif (game room, dorm, props Indonesia), installer npm-publish, access code (defer), read-only penuh (viroom boleh write ke SQLite sendiri).

---

## 3. Roadmap Fase (owner kru)

| # | Item | Owner | Effort | Fase |
|---|---|---|---|---|
| R0 | Scaffold project: git init, package.json, Elysia server skeleton, Vite+shadcn, SQLite schema | @sanji + @zoro | S | **Fase 1** |
| R1 | Hermes CLI adapter (Source<T>, systemRun, cache, regex guard) di Elysia | @sanji | M | Fase 1 |
| R2 | Office 3D live: `createLayout` + state→posisi + WS live | @zoro (+@sanji) | L | Fase 1 |
| R3 | Cron multi-profile + month view | @sanji + @zoro | M | Fase 2 |
| R4 | Token usage page | @sanji + @zoro | M | Fase 2 |
| R5 | Test pipeline (vitest, DI mock, partial-failure E2E, coverage threshold) | @franky + @chopper | M | Fase 2 |
| R6 | Deploy/ops: build, serve, `127.0.0.1`, stale-banner apiVersion | @jinbe | M | Fase 3 |

**Urutan**: R0 → (R1 ∥ R2) → R3/R4/R5 paralel → R6.
Riset lama `roomoff/docs/research/` sudah dipindah ke `viroom/docs/research/` (file 05 sempat salah tulis di `ruang/`, sudah dipindah & dirapikan).

## 4. Prinsip Kerja Keras
1. **Data asli saja** — tidak ada placeholder/simulasi yang dipresentasikan sebagai data sistem (aturan Bang Bas, berlaku juga untuk viroom).
2. Source gagal → `unavailable` + fallback, bukan crash.
3. Read-only terhadap `hermes` CLI; tulis hanya ke SQLite viroom.
4. Semua input CLI divalidasi regex sebelum masuk `execFile`.
5. Jangan install dependency baru tanpa bilang (aturan brief).
