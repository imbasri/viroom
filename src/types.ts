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
