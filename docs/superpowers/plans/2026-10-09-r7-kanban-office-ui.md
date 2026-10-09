# R7: Kanban Dashboard + Office UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Ruang-style dashboard pages in viroom — Kanban board (`/kanban`), Memory & Knowledge (`/memory`), and the 3D Office (`/office`) — wired to backend endpoints, under a shared shadcn layout, with routing in App.tsx.

**Architecture:** Backend (Elysia) exposes read-only sources: `GET /api/tasks` (kanban board + boards list), `GET /api/tasks/:id` (task detail), `GET /api/memory`, `GET /api/profiles`. Frontend (React 19 + shadcn, Tailwind v4) reuses the ruang component shapes with viroom's existing card/button/ui primitives. Calendar already exists (R3) so it keeps its `/calendar` route and `useCronStore`.

**Tech Stack:** ElysiaJS, Bun, React 19, TypeScript, shadcn, @react-three/fiber, three.

**Spec:** Reference READ-ONLY `/home/basrenk/projects/ruang/src/pages/` (Office3D.tsx, TaskBoard.tsx, Memory.tsx, Agents.tsx, Calendar.tsx, Office.tsx, routes.ts, types.ts, ui.tsx) + viroom existing `/home/basrenk/projects/viroom/frontend/src/` (App.tsx, store.ts, pages/Calendar.tsx, components/ui/button.tsx, components/ui/card.tsx, store.ts, types from src/types.ts).

## Global Constraints

- Read-only dashboard — mirror `hermes kanban` / `hermes memory` / profile facts; no writes to the kanban DB.
- `GET /api/tasks` returns `TaskBoardSnapshot` (source of `Task[]` + `KanbanBoard[]` + `fetchedAt`).
- `GET /api/tasks/:id` returns `TaskDetailSnapshot` (`Source<TaskDetail|null>`).
- `GET /api/memory` returns `MemorySnapshot` (`AgentMemory[]`).
- `GET /api/profiles` returns `RuntimeSnapshot` (profiles + optional OpenCode).
- Frontend uses viroom's existing shadcn components (`@/components/ui/*`) and `@/lib/utils` `cn()`.
- Dark zinc theme (zinc-900/950) to match Calendar page.
- Bun v1.3.14, existing 39 vitest tests must still pass; E2E partial-failure pattern respected.
- Office 3D reuses viroom's existing `/api/office` (office-server.ts + lib/office3d-layout.ts) with N from env (default 12), port 3001.
- No new npm packages beyond what `package.json` lists; lazy-load `three` in the 3D route only.

## Review Focus

1. **Offline / unavailable server** — Kanban & memory pages show a usable EmptyState / SourceStatus + retry; no crash on fetch failure.
2. **Empty board / no tasks** — `TaskBoard` shows the empty state ("Create one with `hermes kanban create`"), not a blank grid.
3. **Memory disabled / not available** — `StoreCard`/`AgentPanel` show "disabled in config" or "not available" instead of crashing.
4. **Task detail load failure** — dialog falls back to board summary, not a 500.
5. **3D load path** — OrbitControls + r3f lazy-loaded; if `three` fails to download, 2D office fallback page renders.

---

### Task R7a: Routing + shared layout

**Files:**
- Create: `frontend/src/App.tsx` (full rewrite: tab/nav shell + page mounts)
- Create: `frontend/src/pages/Office.tsx` (2D office fallback / base)
- Modify: `frontend/src/pages/Calendar.tsx` (keep; wire into new shell as a tab)
- Create: `frontend/src/lib/layout.tsx` (Layout + PageTitle + header toolbar, reused by all pages)

**Interfaces:**
- Consumes: viroom `@/components/ui/card`, `@/components/ui/button`, `@/lib/utils` `cn`.
- Produces: `Layout({ children, title, eyebrow, actions })` component; `usePageNav()` hook for tab switching.

**Steps:**
- [ ] Define `type Page = 'office' | 'kanban' | 'memory' | 'agents' | 'calendar'` with `pageSlug(page)` / `pageFromHash(hash)` (mirrors ruang routes.ts).
- [ ] Write `Layout` shell: top nav tabs (RUANG style → viroom branding "viroom" + sync/status label), side/toolbar with refresh + theme toggle, shared error boundary.
- [ ] Mount each page component by route; keep Calendar under its existing `useCronStore`.
- [ ] Verify: dev at :3000/:5173, typing `#/kanban`, `#/memory`, `#/office` navigates; `bun run typecheck:web` clean; `bun run build` exits 0.

### Task R7b: Office3D page (fetch /api/office :3001)

**Files:**
- Create: `frontend/src/pages/Office3D.tsx` (3D office — adapted from ruang/src/pages/Office3D.tsx)
- Create: `frontend/src/pages/Office.tsx` (2D fallback when r3f/three unavailable)
- Create: `frontend/src/lib/3d-loader.ts` (lazy `import()`, error-tolerant r3f bootstrap)

**Interfaces:**
- Consumes: GET `/api/office?n=N` from office-server.ts; `OfficeStation[]` contract (`id, name, state, activity, seat, privacy`, etc.).
- Produces: `<Office3D stations onSelect>` component; `Office` page that auto-toggles between 3D/2D.

**Steps:**
- [ ] Copy ruang Office3D.tsx structure: `Character`, `LabelProjector`, `Controls(OrbitControls)`, `Office3D(stations, onSelect)`.
- [ ] Replace room/floor assets with viroom's existing `lib/office3d-layout.ts` `createLayout(n)` + `stateToPosition`, mirroring office-server.ts.
- [ ] Wire `fetch('/api/office')` + `useOfficeStore` polling (like ruang `usePolling`), handle `n` param from URL/env.
- [ ] Build lazy 3D loader: dynamic `import('@react-three/fiber')` + `import('three')`, catch failure → render `Office` 2D fallback (grid of agent cards from `/api/office`).
- [ ] Verify: `bun dev` → `#/office` shows 3D scene; orbit controls work (drag/pan/zoom/floor switch); 2D fallback renders on network block of three.

### Task R7c: Kanban page (fetch /api/tasks, card UI)

**Files:**
- Create: `frontend/src/pages/Kanban.tsx` (from ruang/src/pages/TaskBoard.tsx)
- Create: `frontend/src/store.ts` export `useKanbanStore` (or keep single store module)

**Interfaces:**
- Consumes: GET `/api/tasks` → `TaskBoardSnapshot`; GET `/api/tasks/:id` → `TaskDetailSnapshot`.
- Produces: `<TaskBoard />` with columns (`triage/todo/ready/running/blocked/done`), task cards, detail dialog, assignee/board/search filters, `fetchedAt` sync label, retry.

**Steps:**
- [ ] Implement columns via `orderedStatuses` mapping (Ruang: `['triage','todo','ready','running','blocked','done']`).
- [ ] Task card: `title`, `id`, `board` chip, `assignee`, `priority P{n}`; click opens detail dialog.
- [ ] Detail dialog: fields (created, started, completed, workspace, branch, model, tenant, skills, depends-on, blocks, description, result, runs table, comments, events), fallback-to-summary on load failure.
- [ ] Filters: search (title/id/assignee), assignee dropdown, board dropdown; count badge per column.
- [ ] Verify: mock `TaskBoardSnapshot` in `test/di-mock.test.tsx` — columns render counts; empty tasks → empty state; failed source → `SourceStatus` + Unavailable component.

### Task R7d: Memory page (fetch /api/memory, honcho profile)

**Files:**
- Create: `frontend/src/pages/Memory.tsx` (from ruang/src/pages/Memory.tsx)
- Create: `frontend/src/pages/Agents.tsx` (from ruang/src/pages/Agents.tsx)

**Interfaces:**
- Consumes: GET `/api/memory` → `MemorySnapshot`; agents tab reuses `/api/profiles` → `RuntimeSnapshot`.
- Produces: `<Memory>` with per-agent tabs, `AgentPanel` (MEMORY.md / USER.md / SOUL.md / context files), lock gating; `<Agents>` crew grid.

**Steps:**
- [ ] `Memory` page: tab list of agents with peak `%` + entries count; selected panel; private gate + ProfileUnlock for locked agents.
- [ ] `AgentPanel`: StoreCard for MEMORY.md (usage bar, entries, redaction notice at ≥80%) and USER.md; SOUL.md document viewer; context files accordion.
- [ ] `Agents` page: crew grid from `/api/profiles` (Hermes profiles + optional OpenCode), model/gateway/in-office status.
- [ ] Verify: mock `MemorySnapshot` — disabled config shows "disabled in config"; unavailable profile shows EmptyState; entry count + peak bar renders.

### Task R7e: Backend endpoints

**Files:**
- Create: `src/kanban.ts` (kanban bridge: `GET /api/tasks`, `GET /api/tasks/:id`)
- Create: `src/memory.ts` (memory bridge: `GET /api/memory`)
- Create: `src/profiles.ts` (profiles source: `GET /api/profiles`)
- Modify: `src/api.ts` (attach `.use` for kanban/memory/profiles + comment header)
- Create: `src/hermes-kanban.ts` / `src/hermes-memory.ts` / `src/hermes-profiles.ts` (CLI adapters: `hermes kanban show`, `hermes memory show`, `hermes profile list`)

**Interfaces:**
- `GET /api/tasks` → `{ tasks: Source<Task[]>, boards?: KanbanBoard[], fetchedAt }`
- `GET /api/tasks/:id?board=b` → `{ task: Source<TaskDetail|null>, fetchedAt }`
- `GET /api/memory` → `{ agents: AgentMemory[], fetchedAt }`
- `GET /api/profiles` → `{ profiles: Source<{name,model,gateway}[]>, openCode: Source<string>, fetchedAt }`
- All adapters return `{ availability, data, error }` and set `fetchedAt = new Date().toISOString()`.

**Steps:**
- [ ] `profiles.ts`: run `hermes profile list` via `execFile` (timeout 8s, NO_COLOR=1, COLUMNS=200 pattern from src/hermes.ts); parse JSON → map name/model/gateway; include OpenCode detection (hermes profile show opencode → model string).
- [ ] `kanban.ts`: run `hermes kanban show --format json` (or `hermes kanban list`); parse to `Task[]` + `KanbanBoard[]`; task detail via `hermes kanban show <id>` + `kanban show <id> --log` fallback; sanitize secrets (no raw SQLite reads).
- [ ] `memory.ts`: `hermes memory show <profile>` → parse MEMORY.md / USER.md / SOUL.md / context files; redact sensitive markers; compute `percent` from limit config.
- [ ] Wire `.use(api).use(kanban).use(memory).use(profiles)` on `/api` prefix.
- [ ] Verify: `bun test` 39 existing tests pass; manual curl `GET /api/tasks` / `/api/profiles` / `/api/memory` returns valid JSON with `fetchedAt`.

### Task R7f: vitest + tsc coverage on R7 pages+api (39 existing ok)

**Files:**
- Modify: `test/di-mock.test.tsx` (add R7 fixture suites: kanban columns, memory stores, profiles)
- Run: `bun run test` → 39+ tests pass; `bun run typecheck`; `bun run build`

**Steps:**
- [ ] Add DI-mocked test suites for `TaskBoard` (columns/count/filter/empty-state/failed-source), `Memory` (stores/locked/unavailable), `Profiles`, `Office3D` (layout n-station).
- [ ] Confirm all 39 existing tests still pass (no regression).
- [ ] `bun run typecheck` clean (server + web).
- [ ] `bun run build` exits 0; commit to branch, push; report.
