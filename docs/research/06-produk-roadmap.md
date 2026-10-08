# 06 · Analisis Produk Ruang & Roadmap Adaptasi untuk Roomoff

> Penulis: @NAMI (PM) · 2026-10-09 · READ-ONLY terhadap repo `/home/basrenk/projects/ruang`
> Ruang: "3D virtual office & read-only mission control" untuk kru Hermes Agent + OpenCode.
> 80 stars, 41 forks, dibuat 2026-09-27. Backend: Express (Node). Frontend: React + Vite, view 3D via three.js/React Three Fiber (lazy-loaded) + view 2D CSS-only.

---

## 1. User value — siapa target, apa value prop terkuat

**Target user (dari README):** pemilik/setup-operator mesin yang menjalankan **lokal multi-agent Hermes Agent crew** (Hermes profiles) dan/atau OpenCode. Bukan SaaS multi-tenant, bukan tim besar. Skenarionya: satu operator (sering solo dev / power user) yang menjalankan beberapa profil agen + OpenCode di satu mesin (macOS, Linux, WSL2), butuh **melihat siapa agen-nya lagi apa** tanpa buka terminal satu-satu. Akses dari laptop via SSH tunnel (`ssh -L 3001:127.0.0.1:3001 user@server`), bind 127.0.0.1 only.

**3 value prop terkuat:**

1. **Live presence visual multi-agen** ("3D virtual office") — status `Idle/Working/Reviewing/Collaborating` di-render sebagai karakter di office; idle agen "berkeliar" (ping-pong, game, pantry, tidur di lantai 2). State diderivasikan server dari sinyal nyata (agent.log 3 menit terakhir, task Kanban running/review, session aktif, gateway status) — bukan laporan agen sendiri. Visual fun = indikator status yang gampang dibaca sekilas; ini hook utama repo.
2. **Mission control read-only lengkap dalam satu layar** — Task Board (Kanban Hermes, multi-board), Calendar (cron semua profile, month view + list overdue/next run), Activity (20 session terakhir), Memory (SOUL.md/MEMORY.md/USER.md + context files per agen), Folders (browsable per agen, read-only + secret-redacted), Logs (agent/gateway/errors tail + command audit), Usage (token/insights per agen 24j/7/30 hari), Channels (status messaging). Semua dari CLI `hermes` yang sudah ada — tidak ada source of truth baru, tidak ada mutasi.
3. **Keamanan read-only + dua lapisan lock opsional** — Access code (scrypt hash, cookie HttpOnly, rate-limit login) dan Profile lock (PIN per agen, menyembunyikan data private agen tertentu di browser dengan 423 + redaction server-side per request). Nilai: aman di-tunnel tanpa membuka port publik, dan per agen yang datanya sensitif (mis. agen yang pegang API key pribadi) bisa disamarkan per browser.

**Fitur kunci lain yang relevan:** agent discovery otomatis (`hermes profile list` = 1 agen; warna karakter derived dari nama, konsisten antar browser), polling + cache server (10 dtk, in-flight dedup), theme day/evening, install 1 baris + systemd user service.

## 2. Gap terhadap roomoff

Roomoff saat ini: backend **Elysia** (workspace `backend`), frontend **React + Vite + shadcn + zustand**, halaman Agents / TaskBoard / Activity / Calendar / Dashboard / Memory / VisualOffice (2D pixel-art office, SVG tile-based, state color per agen, desk+lounge spot) / Office3D (**placeholder**: capsule + grid + Html label, posisi hard-coded, tidak connected ke data). Sudah ada WS `/office-ws` (event `agent`/`task`) + polling fallback.

**Fitur ruang yang TIDAK ada di roomoff (gap):**

| # | Fitur ruang | Status roomoff | Prioritas | Alasan |
|---|---|---|---|---|
| G1 | Cron **month view** (run terjadwal dari cron expr + interval, marker overdue/last-run, filter per agen, per profile) | Tidak ada; Calendar = card list cron saja, single profile | **P0** | Value prop cron per-profile (Hermes simpan cron per profil) hilang; "next run" jadi info penting untuk semua halaman |
| G2 | **Office 2D/3D terhubung ke state agen** (karakter di desk vs lounge vs meeting, speech bubble aktivitas, idle-wandering dekoratif, klik→detail dialog Overview/Folder/Memory tab) | Tidak ada: VisualOffice sudah pixel-art tapi tidak jelas ter-bind ke `/office/agents` data; Office3D placeholder hard-coded | **P0** | Ini "why orang buka roomoff" — office visual yang benar-benar live. Tanpa ini roomoff = dashboard biasa. |
| G3 | **Token usage / insights per agen** (total 24j/7/30h, per model, top tools, top consumer, per source) | Tidak ada | **P1** | Biaya = pain nyata multi-agen; data dari `hermes insights` sudah ada, tinggal endpoint + page. |
| G4 | **Detail Kanban task via `hermes kanban show`** (description, result, runs, comments, events, depends on/blocks) + multi-board filter | Tidak ada; TaskBoard = DB roomoff sendiri (todo/doing/done) | **P1** | Kanban di roomoff adalah DB internal; integrasi ke Kanban Hermes = konteks "task ini dijalankan agen mana, hasilnya apa" — tapi effort besar karena 2 sistem task co-existing; mulai dari detail dialog saja. |
| G5 | **Folders & Memory per agen** (browse folder agen read-only, SOUL/MEMORY/USER + §-entries + usage bar limit, context files) | Memory page ada (1 endpoint generik), Folders per agen tidak ada | **P1** | Memory per agen = visibility "apa yang agen ini bawa ke tiap session"; Folders = power feature yang sulit di-replication (safety layer path resolution, redaction). |
| G6 | **Access code + profile lock** (scrypt, cookie, 423 redaction per agen) | Tidak ada | **P2** | Penting hanya jika roomoff akan di-tunnel/reverse-proxy; lokal-only dulu → defer. |
| G7 | **Logs tail (agent/gateway/errors) + command audit** | Tidak ada | **P2** | Debug value tinggi tapi niche; setelah P0/P1. |
| G8 | **Dashboard aggregasi** (counts semua source, byStatus Kanban, next cron, channel status, command health, single fetch) | Dashboard.tsx ada (perlu cek kedalaman) | P2 | Tumpang-tindih sebagian; rapikan setelah G1/G2. |
| G9 | **Polling + stale-marking + "Restart needed" banner (API version mismatch)** | Tidak ada | P2 | UX robustness kecil tapi mahal jika server sering di-restart (dev workflow). |
| G10 | **Live activity office: speech bubble dari `agent.log` 3-menit** (reply chat → Collaborating di meja rapat; cron → Working di desk; tools → Working) | Tidak ada | P1 (bagian dari G2) | Tanpa ini office cuma status, bukan "lagi ngapain". Ini yang bikin fun+berguna. |
| G11 | Install 1 baris + systemd user service + `ruang access-code`/`profile-lock` CLI | Tidak ada | P2 | Distribusi, bukan feature; roomoff mungkin tidak perlu (bisa pakai `npx`). |

## 3. 1 open issue GitHub ruang

Issue yang masih **open** (list `/issues`) adalah **#2 "Invitation to share ruang on GithubStarMate…"** — buka oleh *martinkevin3* 2026-10-08, bukan feature request; ini invitation/CS untuk promosi repo, bukan defect. (Issue #1 "Render CLI tool agents as stationary computer stations" sudah **closed**; OpenCode sudah dirender sebagai computer station stasioner, flag `isTool` di roster, 102 test pass.)

**Relevansi untuk kita:** minim secara langsung (pure promo). Tapi #1 yang closed tetap relevan sebagai referensi desain: pola "tool/runtime agen ≠ agen profil Hermes, tampil beda (stasioner, tidak berkeliar)" — bisa ditiru di office roomoff nanti saat OpenCode muncul di roster.

## 4. Roadmap tiru ke roomoff (5 item teratas)

Estimasi: S ≈ ≤1 hari, M ≈ 2–4 hari, L ≈ 1 minggu+. Owner: @zoro (frontend), @sanji (backend/Elysia), @jinbe (deploy).

| # | Item | Owner | Effort | Alasan |
|---|---|---|---|---|
| R1 | **Office live 2D/3D terhubung data**: bind VisualOffice (2D pixel-art) + Office3D ke payload `/office/agents` + WS `/office-ws`; state → posisi (desk/lounge/unknown mat), speech bubble aktivitas, detail dialog (Overview tab dulu). 3D: ganti hard-coded capsule dengan layout dari jumlah agen (copy pola `createLayout(stations.length)` ruang), tetap lazy-loaded. | @zoro (FE), @sanji (payload bentuk server: `OfficeStation[]`) | **L** | G2+G10, value prop utama; tanpa ini roomoff cuma dashboard. |
| R2 | **Cron multi-profile + month view**: endpoint Elysia yang read cron per-profile (`hermes -p <profile> cron list --all`, konversi cron expr → next runs bulan berjalan), page Calendar = month grid + marker overdue/last-run + filter agen. | @sanji (backend parsing cron expr + endpoint), @zoro (grid UI, copy pola `MonthView`/`cron-calendar.ts` ruang) | **M** | G1, P0; cron per-profile hilang total sekarang. |
| R3 | **Token usage page + endpoint**: `hermes -p <profile> insights --days N` per profile (limit concurrent 4, cache 60 dtk), page 24j/7/30h: total, per agen, per model, top tools. | @sanji (backend), @zoro (chart/table) | **M** | G3, P1; biaya nyata, data sudah tersedia di mesin. |
| R4 | **Task detail dialog (Hermes Kanban show)**: endpoint `/api/tasks/hermes/:id` (read-only, `hermes kanban --board <slug> show <id> --json` + redaction secret), dialog di TaskBoard: description, result, runs, comments, deps. Multi-board filter di halaman Kanban (bukan DB roomoff; dua tab terpisah: "Roomoff tasks" vs "Hermes Kanban"). | @sanji (endpoint + redaction), @zoro (dialog + tab) | **L** | G4, P1; jembatan ke world Kanban Hermes. Dua-nya sistem task co-existing → desain tab, jangan gabung. |
| R5 | **Deploy & ops kit**: build + serve single-process (Elysia serve dist FE), bind 127.0.0.1, systemd user service / `--service` pola ruang, banner "server stale vs UI" (`/api/health` berisi apiVersion + startedAt; UI cek & tunjukkan "Restart needed"), + polling stale-marking (temukan last good data, tandai stale saat refresh gagal). | @jinbe (deploy + service), @zoro (banner/stale UI) | **M** | G9 + R4 pre-requisite; bikin roomoff "tinggal buka" untuk kru multi-agen. |

**Urutan kerja:** R1 & R2 paralel (FE L / BE M), R3 setelah R2 (pola `hermes -p` sudah ada), R4 paralel R3, R5 terakhir (sekaligus release checklist). Memory/Folders per agen (G5) dan Lock (G6) masuk wave 2 setelah R5.

## 5. Yang TIDAK ditiru (dengan konteks roomoff)

- **Backend Express → Elysia tetap.** Jangan port server ruang ke Express; roomoff sudah Elysia, pattern caching/route di Elysia lebih ringkas. Yang ditiru = **data model + safety layer** (fixed command allowlist, execFile timeout 8 dtk, cache 10 dtk in-flight dedup, NO_COLOR+COLUMNS, redaction 2 pass), bukan framework.
- **Read-only design: JANGAN tiru 100%.** Ruang sengaja read-only karena datanya milik `hermes` CLI (menulis = mutasi state Hermes, risiko). Roomoff TaskBoard **punya DB sendiri + write endpoints (POST/PATCH/DELETE)** → pertahankan; read-only hanya untuk source Hermes (Kanban/Hermes cron, insights, folders, logs, memory) — tulis DB roomoff tetap boleh. Gabungkan dalam 1 halaman dengan tab terpisah, jangan campur mutasi.
- **three.js 3D full-scene (office, game room, lantai 2, dorm, karambol, bakso cart, kopi keliling, flag, split AC, procedural texture, LabelProjector, walkPath3, sleep mode…) → TIDAK ditiru 1:1.** Roomoff sudah punya **VisualOffice 2D pixel-art** sebagai identity (SVG tile, state color, tanpa WebGL) dan Office3D placeholder. Yang ditiru: *prinsip* — lazy-load 3D, 2D fallback non-WebGL, state-driven placement, karakter warna derived dari nama. Upgrade Office3D roomoff: capsule → box character sederhana (copy pola Character 20 baris ruang), posisi dari `createLayout(n)`, idle wandering off (dekoratif, skip dulu), 1 lantai (lantai 2 skip). 2D pixel-art tetap default, 3D = bonus view.
- **Indonesian decorative content** (gorengan, galon, karambol, ruko balcony, lampu string, bakso) — khas ruang, skip; office roomoff netral/dengan identitas sendiri.
- **Access code & profile lock (P2)** — defer sampai roomoff di-tunnel/dibagikan; lokal 127.0.0.1 dulu, biaya scrypt/cookie/rate-limit tidak perlu sekarang.
- **Installer script yang download Node.js sendiri / npm publish / release workflow .tgz** — roomoff bukan distribusi publik tahap ini; cukup `npm run build` + serve + systemd (R5).
- **"Events not synthesized" / "cron-only calendar" (slogan ruang):** tiru framenya (kalender hanya cron, jangan infer event umum) — tapi itu bukan sesuatu yang harus di-IMPLEMENT baru, cukup aturan desain saat bikin G1.

---

## Ringkasan

- Ruang = read-only mission control + live office visual untuk multi-agent local; value = presence, visibility, cheap.
- Gap roomoff terbesar: office belum live (G2/G10), cron per-profile month view (G1), token usage (G3).
- Issue open #2 = undangan promosi, tidak relevan teknis; #1 (closed) = referensi pola "tool station".
- Roadmap 5 item: R1 office live (L, @zoro/@sanji), R2 cron multi-profile (M, @sanji/@zoro), R3 usage (M, @sanji/@zoro), R4 kanban detail (L, @sanji/@zoro), R5 deploy+stale UX (M, @jinbe/@zoro).
- Tidak ditiru: Express, 3D full-scene dekoratif, installer, access code (defer), read-only penuh (TaskBoard roomoff tetap write).
