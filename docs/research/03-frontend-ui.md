# Riset Frontend Ruang — UI/UX 3D & Mission Control

Reposit: https://github.com/yugienugraha/ruang (clone lokal: `/home/basrenk/projects/ruang/src/`)
Status: **READ-ONLY**, tidak ada build/install/edit di repo.
Teknologi utama: React 19 + Vite + TypeScript + **@react-three/fiber** / **three** (r3f + r3) + vitest (jsdom). Server Express.

---

## (a) Routing

File: `src/routes.ts` — **Hash-based**, bukan History API.

- Cara pakai: `window.location.hash` → `/office`, `/agents`, `/#/memory` (alias `knowledge`), `/dashboard` → Office.
- `pageFromHash` strip `#/`, ambil slug pertama, lower-case; `knowledge` → `Memory`, `dashboard` → `Office`.
- Tidak ada `useRouter`, `pushState`, atau scroll-to-top handler; navigasi via `window.location.hash = '/${pageSlug}'`.
- **10 route**, `navigation = ['Office','Agents','Usage','Task Board','Task Board' ...]`:
  1. Office
  2. Agents
  3. Usage
  4. Task Board
  5. Calendar
  6. Activity
  7. Memory
  8. Folders
  9. Logs
  10. Settings
- Route default (hash kosong/tidak dikenal) = `Office`.
- Konvensi slug: `pageSlug` → lowercase + `/-` (spasi jadi `-`).

## (b) Data fetching

**`src/polling.ts`** — hook `usePolling<T>(path, intervalMs = 15000)` → return `RequestState<T> & { refreshing, refresh }`.

- Interval default **15 detik** (15_000 ms). Di `App.tsx`: dashboard `/api/dashboard` 15s, health `/api/health` 60s.
- **Pause saat tab hidden**: `if (typeof document === 'undefined' || !document.hidden) void load()` → interval hanya jalan saat tab visible. `refresh` (tombol ↻) selalu fetch fresh.
- **Dedupe request**: satu `load()` per interval, `mounted` ref mencegah setState after unmount; refresh manual memicu `fresh=1` query string.
- Tidak pakai request coalescing/ AbortController eksplisit — dedup-nya level render hook (satu `load` ref).

**`src/request-state.ts`** — model 3 status:

```ts
{ status: 'pending' }
| { status: 'ready'; data: T; stale?: boolean }
| { status: 'failed'; httpStatus?: number; message?: string }
```

- `loadSnapshot<T>`: try/catch → `failed` tanpa status; `response.ok` false → parse body JSON, jika 401 + `locked:true` → dispatch `LOCKED_EVENT` (pemicu UI lock). `describeFailure` memberi pesan yang bisa diaksi operator (restart server, port tabrakan).
- `mergeRefresh`: background refresh gagal + previous ready → data lama dipertahankan **dengan flag `stale: true`** (tampilan tetap, label "STALE").
- Error JSON non-JSON → `failed` "bukan JSON".

## (c) 3D scene

**Stack: @react-three/fiber (r3f) + three** (r3).

- `src/pages/Office3D.tsx` — entry point scene (react three fiber, controls, camera).
- **Agent direpresentasikan sebagai "station"** dari API (`/api/office`): `stations[]` → `OfficeStation { id, name, role, room, roomPosition, state, seat, currentTask, ... }`.
- `officeState.ts`: `OfficeState = 'Idle'|'Working'|'Reviewing'|'Collaborating'|'Offline'|'Unknown'`, helper `officeStateBadge(state)` → tone (good/muted/unknown).
- **State → posisi/animasi** lewat `office3d-layout.ts`:
  - `createLayout(agentCount)` build world deterministik: hot-desking, satu meja per agen, dua baris tumbuh ke kiri; jumlah kolom = `ceil(agentCount/2)`, `min(3 kolom)`.
  - `placementFor(station, layout, meetingIndex)` → `Placement { position, facing, seated, label? }`: desk `seat n` → `desks[seat]`, meeting → `meetingSeat(index)`, Lounge → `LOUNGE_SEATS`.
  - `walkPath3(from, to, layout)` → waypoint path menghindari furnitur (groundRoute/upperRoute via `AISLE_Z`, `ENTRANCE_X`, `SIDEWALK_Z`, staircase crossing floors, `floorOf`).
  - `idlePlan(seats, time, layout)` → posisi agen idle deterministik per waktu (`IDLE_STOP_MS = 32000`), `IDLE_ROUTE` urutan stop, no two agents share spot.
- Props/objek: `scene3d/props.tsx` (WorkDesk, OfficeChair, MeetingTable, Sofa, ... gerobak bakso, kopi sepeda, tanaman, AC, lampu, flag pole, dll) — primitif three.js dengan `RoundedBoxGeometry`, PBR.
- Tekstur: `scene3d/textures.ts` — **canvas-procedural** (Canvas API), tidak ada gambar/model eksternal; cached `Map`, deterministik seed RNG.
- Lingkungan: `scene3d/environment.tsx` — `Building` (cut-away dollhouse, dinding depan rendah), `BuildingShell` (lantai 2 melihat lantai 1 tertutup), `UpperFloor` (kamar tidur, lesehan, kamar mandi, balkon ruko), `Outdoors` (halaman, trotoar, gang, gerobak). Lampu menyala saat mode dark/evening (`night` prop).
- Kamera: `DEFAULT_LAYOUT.camera` → target + offset; `pan` bounds dipatuhi `clampTarget`.

## (d) Komponen bersama & styling

**`src/format.ts`** — utilitas display: `formatNumber`, `formatCompact` (Intl `notation: compact`), `formatTime(iso)`, `formatDateTime`, `formatBytes`, `agentLabel(profile)` → profile name atau "Hermes", `TASK_STATUS_ORDER` (Hermes Kanban order), `statusTone(status)` → 'good'|'info'|'bad'|'muted'|'unknown'.

**`src/agents.ts`** — `AgentLook { hair, skin, shirt, pants }` deterministik dari id via **FNV-1a** `hashName(id)`, 4 array palette warna (8/5/10/6 item).

**`src/preferences.ts`** — `Theme = 'dark'|'light'`, `usePreferences()`:
- `initialTheme()`: SSG→'dark'; baca `localStorage['mc.theme']`; fallback `matchMedia prefers-color-scheme`.
- Simpan & sync `document.documentElement.dataset.theme = theme` → `localStorage.setItem('mc.theme')`.

**Styling:** **bukan shadcn, bukan Tailwind.** CSS native dengan **CSS custom properties (BEM-ish)** di `src/styles.css` (803 baris).

- `:root { --c-0b0e0c, --c-101311, ... }` — 50+ token warna; dark-first, light derived.
- Class: `.app`, `.app-office`, `.drawer`, `.drawer-backdrop`, `.icon-button`, `.refresh-button`, `.primary-button`, `.field-label`, `.text-input`, `.lock-screen`, `.lock-card`, `.pin-field`, `.pin-input`, `.pin-dots`, `.relock-bar`, `.notice.version-notice`, `.sync-label`, `.header-actions`, `.nav-badge`.
- Inline style praktis: tidak dipakai untuk layout/semantik; styling via CSS.

## (e) Lock screen & autenticasi

- `LockScreen.tsx` (`src/LockScreen.tsx`, 42 baris): `LockScreen({ status: AccessStatus, onUnlocked })` — input code, SHOW/HIDE toggle, **remember device** checkbox (`remember` → `status.rememberDays`), error message, disabled busy state, title "Locked · Ruang". API: `accessRequest('unlock', { code, remember })` (lihat `access.ts`) → `AccessStatus { enabled, unlocked, rememberDays, minLength }`.
- `ProfileUnlock`, `RelockBar`, `PrivateGate` (`src/ProfileLock.tsx`, 56 baris): PIN 6 digit, `profileLockRequest('unlock', { agent, pin })` → buka privat per agen selama `minutes` (default 15), `PrivateGate(agent, children)` → tampilkan PIN prompt saat locked, tampilkan RelockBar saat unlocked (server-side enforcement tetap jadi otoritas; UI hanya tampilkan).
- State persistensi:
  - Access session: `localStorage` di backend (file code + `loadAccess`).
  - Theme: `localStorage['mc.theme']` + `dataset.theme`.
  - Profil lock: `profile-lock.ts` (handle event `PROFILES_CHANGED` → refresh semua sumber via `tick` di `RefreshContext`).
- Event sink: `window.dispatchEvent(new Event(LOCKED_EVENT))` saat 401 locked; `App` listener → reload access check & tampilkan LockScreen.

## (f) Yang TIDAK ada

- **Bukan shadcn/ui** (tidak ada `import` @radix, komponen shadcn).
- **Bukan Tailwind** (nol string `className` Tailwind; CSS file 803 baris, token CSS).
- **Tidak ada global state manager** (zustand/redux/jotai/mobx). State lokal React: `useState` hook, context `RefreshContext`, `usePolling`, `useProfileLock`-style. Cross-page routing = `window.location.hash`.
- Tidak ada CSS-in-JS; satu `styles.css` diimport `main.tsx`.
- Tidak ada gambar/model eksternal — tekstur canvas procedural.

## (g) Frontend tests yang diuji

Dir `src/*.test.*` (vitest, `test`: `vitest run`):

1. `office-dialog-focus.test.tsx` — **office-dialog focus**: detail dialog tab navigation, focus wrap (Tab/Shift+Tab), `Escape` kembalikan focus ke station trigger.
2. `pending-state.test.tsx` — **pending-state**: Stats/Agents render "Loading" saat dashboard null; Office pending tampilkan Loading, tidak "0 active work"/"No declared idle presence".
3. `access.test.tsx` — **access**: `generateCode()` regex pola `ruang-XXXX-...`, `codeFileText` isi file recovery, `accessRequest` header `x-ruang-request`, LockScreen render (remember days), Settings (set/change/LOCK THIS BROWSER).
4. `office-state.test.ts` — office badge tones.
5. `request-state.test.ts` — `loadSnapshot`/`mergeRefresh` (pending/ready/stale/failed, 401 → LOCKED_EVENT).
6. `routing-and-refresh.test.ts` — routing (slug, alias dashboard/knowledge, home default), polling interval/pause hidden-tab.
7. `office3d-layout.test.ts` — `createLayout` deterministik, `walkPath3`, `idlePlan`, `meetingSeat`.
8. `lounge-layout.test.ts`, `cron-calendar.test.ts`, `usage.test.tsx`, `api-version.test.ts` — layout lounge, kalender, usage, versi API.

---

## Ringkasan cepat

| Aspek | Temuan |
|---|---|
| Routing | Hash API, 10 route |
| Polling | 15 s default (dashboard), pause saat hidden, 60 s health, fresh=1 manual |
| Request state | pending / ready(stale?) / failed, 401 → LOCKED_EVENT, mergeRefresh keep stale |
| 3D stack | @react-three/fiber + three, props/primitive + canvas textures |
| State → 3D | `OfficeStation` → `placementFor` → `desks/seat`, `walkPath3`, `idlePlan` |
| Styling | CSS native tokens, bukan Tailwind/shadcn, bukan inline |
| Lock | LockScreen (code), ProfileUnlock (PIN 6 digit per agen, 15 min), localStorage + events |
| Global store | Tidak ada — React hooks + context `RefreshContext` |
| Tests | office-dialog-focus, pending-state, access + 8 suite lain |
