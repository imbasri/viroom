# R4 — Frontend Usage.tsx: spec kontrak (dari Sanji, backend)

## Context
- Repo: /home/basrenk/projects/viroom, branch `feat/R4`. Jangan push ke main.
- Frontend: `frontend/` (Vite + React 19 + Tailwind v4 + shadcn + zustand). Alias `@/` → `frontend/src/`.
- Backend SUDAH SIAP & TERUJI (27 test lulus, typecheck exit 0): Elysia endpoint `GET /api/insights`.
  - Dev proxy: Vite proxy `/api` → `http://localhost:3000` (vite.config.ts).
  - Profil backend hanya ada di server (default profile saat ini: `default`).

## Endpoint (kontrak — SUDAH ada di src/index.ts, jangan ubah)
`GET /api/insights?days=1|7|30[&profile=<name>]`

Envelope respons (sama di ketiganya):
```
{ status: "ok" | "unavailable" | "error", data: <bawah>, error?: string }
```
- Tanpa `profile` (atau `profile=all`): `data` = InsightsAggregate:
  ```
  {
    profiles: string[],        // semua profil yang di-fanout
    aggregate: InsightsSummary,
    unavailable: string[]      // profil yang gagal (CLI/insights tak ada)
  }
  ```
- Dengan `profile=<name>`: `data` = InsightsSummary tunggal.
- `days` invalid → default 7 (server). Kirim 1, 7, atau 30 saja.

InsightsSummary shape (identik di per-profil & aggregate):
```
{
  profile: string,          // "all" untuk aggregate
  days: number,
  empty: boolean,
  totals: {
    sessions: number, inputTokens: number, outputTokens: number,
    totalTokens: number, toolCalls: number, costUsd: number
  },
  models: [ { model, sessions, totalTokens, toolCalls, cost } ],
  topTools: [ { tool, calls, pct } ]   // max 10, urut desc calls, pct 0-100
}
```
`status:"unavailable"` = hermes CLI tak bisa jalan (error di `data` → null).
`status:"error"` = input invalid / tak terduga (lihat `error`).

## Type
SUDAH DIBUAT: `frontend/src/types.ts` export `InsightsSummary`, `InsightsTotals`,
`InsightsModel`, `InsightsTool`, `InsightsAggregate`, `Envelope<T>`. Pakai itu, jangan duplikat.

## Tugas @zoro
1. `frontend/src/pages/Usage.tsx` (atau komponen; nama file WAJIB `Usage.tsx`):
   - Tab switcher `24H / 7D / 30D` → days `1 / 7 / 30`. Default 7D.
   - State aktif tab, fetch `/api/insights?days=<N>` saat mount + ganti tab.
   - Render dari `Envelope`: 
     - `ok` + data → panel totals (Sessions, Input/Output/Total tokens, Tool calls, Cost $),
       breakdown `models` (list), `topTools` (list/bars dengan pct).
       Untuk aggregate, tampilkan juga `profiles` (chip) + `unavailable` (badge, bila ada).
     - `empty:true` → state kosong ramah ("No sessions in last X days").
     - `unavailable` → banner CLI tak tersedia + pesan `error`.
     - `error` → pesan error `error`.
   - Handle loading & error tanpa crash. Styling konsisten shadcn Card/Button + dark theme
     (zinc-900/950), pakai komponen `@/components/ui/card`, `@/components/ui/button`, `cn`.
   - Format angka: token pakai `toLocaleString()`, cost 2 dp `$`.
2. Integrasikan ke app: `frontend/src/App.tsx` (atau store/router) supaya halaman Usage
   terjangkau (tab nav sederhana atau route). Jaga alur `health check` yang sudah ada tetap jalan.
3. Typecheck + build lokal: `cd frontend && bun install && bun run typecheck && bun run build`
   (atau `tsc --noEmit` + `vite build`). Pastikan zero error, bundle berhasil.
   (Backend jangan di-ganggu — sudah hijau. Cukup verifikasi kamu.)

## Aturan
- Jangan ubah backend (src/*.ts, test/). Backend sudah final & teruji.
- Jangan push ke main. Commit ke `feat/R4` saja.
- Jangan commit secret/credential.
- Boring > clever: satu komponen Usage.tsx + hook kecil fetch, cukup.
  Jangan tambah router library baru.

## Done =
- `Usage.tsx` ada, tab 24H/7D/30D kerja, fetch + render envelope benar, handle empty/unavailable/error.
- `bun run typecheck` & `bun run build` frontend: exit 0.
- Commit di `feat/R4`.
