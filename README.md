# viroom — Hermes CLI Adapter

Dashboard read-only untuk `hermes` CLI: Endpoint Elysia yang mengekspos
availability boards, profiles, dan tasks per board tanpa memutasi state.

## Stack

- Bun + Elysia 1.4.30 + TypeScript (strict, noEmit)
- Adapter: `src/hermes.ts` — `Source<T>` wrapper, `systemRun` via `execFile`
  (timeout 8s, NO_COLOR, COLUMNS=200), cache 10s + in-flight dedup,
  `PROFILE_NAME`/`BOARD_SLUG` regex guard.
- API: `src/index.ts` — `GET /api/health`, `GET /api/runtime`,
  `GET /api/dashboard?board=<slug>`.

## Konfigurasi Binary

| Env | Default | Fungsi |
|---|---|---|
| `HERMITES_BIN` | `hermes` | Path/nama binary CLI yang dipanggil. Set ke `hermes-agent` bila memakai bridge npm `hermes-agent`. |
| `PORT` | `3000` | Port listen server Elysia. |

## Run

```bash
bun install
bun run src/index.ts                 # start server
bun test test/adapter.test.ts        # run test suite
bun run tsc --noEmit                 # type-check
```

Smoke test endpoint:

```bash
curl -s localhost:3000/api/health
curl -s localhost:3000/api/runtime
curl -s 'localhost:3000/api/dashboard?board=viroom'
```

## Respons Envelope

Semua endpoint mengembalikan bentuk:

```json
{ "status": "ok|unavailable|error", "data": ..., "error": "..." }
```

- `ok` — data tersedia.
- `unavailable` — CLI/boards tidak ada atau error keluaran (exit != 0).
- `error` — invalid input (regex guard menolak) atau exception tak terduga.

`/api/dashboard` menggabungkan `health`, `runtime`, dan `tasks` (bila
`board` query diberikan; bila tidak, `tasks: null` dan `board: null`).

## Test

Test suite memakai **fake binary** (`test-bin/fake-hermes.sh`) yang dibuat
on-the-fly di dalam workspace sehingga tidak bergantung pada binary `hermes`
asli. Kontrak yang diverifikasi:

- `Source<T>` wrapper (availability/data/error).
- Regex guard `PROFILE_NAME` / `BOARD_SLUG` (reject invalid).
- Parsers boards (JSON `{slug}` dan fallback line-filter) dan profiles
  (JSON `{name}` dan fallback, strip `*` prefix).
- `hermesRun` cache in-flight dedup + TTL 10s (same-object reference).
- High-level readers: `readHealth`, `readRuntime`, `readTasks`.
- Elysia endpoints via `app.listen` + native `fetch`:
  `/api/health`, `/api/runtime`, `/api/dashboard?board=...`.

## docs/research

File `01..06*.md` konteks belum ada di workspace ini (workspace scratch,
bukan repo yang di-mount dari host). Lihat `docs/research/` bila tersedia
di host.
