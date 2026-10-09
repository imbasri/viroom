// Shared types for viroom backend.
export interface AgentState {
  id: string;
  name: string;
  status: "idle" | "active" | "error";
  position_x: number;
  position_y: number;
  payload: Record<string, unknown>;
  updated_at: string;
}

export interface Session {
  id: number;
  agent_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface Setting {
  key: string;
  value: string;
}

/** Ringkasan tugas kanban tiap board (port dari ruang/src/types.ts Task). */
export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  priority?: number;
  board?: string;
  private?: boolean;
}

/** Kanbboard yang diketahui Hermes. */
export interface KanbanBoard {
  slug: string;
  name: string;
  current: boolean;
  total: number;
}

/** Snapshot penuh board kanban (Source<T> wrapper per board). */
export interface TaskBoardSnapshot {
  tasks: Source<TaskSummary[]>;
  boards?: KanbanBoard[];
  failedBoards?: string[];
  fetchedAt: string;
}

/** Envelope respons /api/kanban, /api/profiles, /api/cron (status + data + error). */
export interface Envelope<T> {
  status: "ok" | "unavailable" | "error";
  data: T | null;
  error: string | null;
}

/** Re-export Source untuk konsumsi frontend. */
export interface Source<T> {
  availability: "ok" | "unavailable" | "error";
  data: T | null;
  error: string | null;
}

/** Payload /api/kanban (semua board). */
export interface KanbanPayload {
  tasks: TaskSummary[];
  boards: KanbanBoard[];
  failedBoards?: string[];
  fetchedAt: string;
}
export type KanbanEnvelope = Envelope<KanbanPayload>;

/** Payload /api/profiles. */
export interface ProfilesPayload {
  profiles: ProfileInfo[];
  openCode?: string;
  fetchedAt: string;
}
export interface ProfileInfo {
  name: string;
  model: string;
  gateway: "Running" | "Stopped" | "Unknown";
}
export type ProfilesEnvelope = Envelope<ProfilesPayload>;
