# viroom

Single-repo project skeleton.

## Stack

- **Backend**: Bun + ElysiaJS + TypeScript + `bun:sqlite` (SQLite)
  - `src/db.ts` — schema init (`agent_states`, `sessions`, `settings`)
  - `src/api.ts` — Elysia routes under `/api`
  - `src/index.ts` — server entry (port 3000)
- **Frontend**: Vite + React 19 + TypeScript + zustand + shadcn/ui (button, card) + Tailwind CSS v4
  - `frontend/` — dev port 5173, proxies `/api` to `localhost:3000`

## Scripts

```bash
bun install            # install all deps (root + frontend)
bun run dev            # dev: server (3000) + web (5173) concurrently
bun run start          # run server only
bun run build          # build frontend
bun run typecheck      # typecheck server + web
```

## API

| Method | Path          | Notes                          |
|--------|---------------|--------------------------------|
| GET    | `/api/health` | `{ ok: true, service: "viroom" }` |
| GET    | `/api/agents` | list agents                    |
| POST   | `/api/agents` | create agent                   |
| PATCH  | `/api/agents/:id` | update status/position/payload |
| GET    | `/api/sessions` | list sessions                |
| POST   | `/api/sessions` | create session               |
| GET    | `/api/settings` | list settings                |
| PUT    | `/api/settings` | upsert setting                |

## Notes

- DB file `data/viroom.db`, auto-created on first `getDb()` call (`VIROOM_DB` to override).
- shadcn/ui components are hand-written in `frontend/src/components/ui/` (button, card).
