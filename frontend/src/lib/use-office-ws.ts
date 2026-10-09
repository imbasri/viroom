// Live office presence — subscribe to /office-ws on connect, apply updates to
// local people state in real time so characters walk without a full 15s poll.
//
// Fallback: if the WS fails, the consumer still has useSource polling data.
// This hook is purely an incremental layer on top of useSource.

import { useCallback, useEffect, useRef, useState } from "react";

export type OfficePersonState = "desk" | "meeting" | "lounge" | "away";

export interface OfficeUpdate {
  type: "update";
  id: string;
  state: OfficePersonState;
  pos: { x: number; y: number; z: number };
}

export interface OfficeSnapshotMsg {
  type: "snapshot";
  n: number;
  layout: unknown;
  people: (OfficeUpdate & { type: "update" } | OfficePerson)[];
}

export interface OfficePerson {
  id: string;
  state: OfficePersonState;
  seat?: number;
  pos: { x: number; y: number; z: number };
}

export interface UseOfficeWsOptions {
  /** Initial people from the useSource snapshot; the hook starts from this. */
  initial: OfficePerson[];
  /** true when the server is reachable (useSource status === "ready"). */
  enabled?: boolean;
  /** Interval before a WS failure gives up and falls back silently. */
  retryMs?: number;
}

export function useOfficeWs({
  initial,
  enabled = true,
  retryMs = 5_000,
}: UseOfficeWsOptions) {
  const [people, setPeople] = useState<OfficePerson[]>(initial);
  const [wsStatus, setWsStatus] = useState<"connecting" | "live" | "off">("off");
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetToInitial = useCallback((next: OfficePerson[]) => {
    setPeople(next);
  }, []);

  // Sync when the initial snapshot from useSource changes (first load / poll refresh)
  useEffect(() => {
    if (initial.length > 0) setPeople(initial);
  }, [initial]);

  useEffect(() => {
    if (!enabled) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/office-ws`;
    let closed = false;

    function connect() {
      if (closed) return;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsStatus("live");
          if (retryRef.current) {
            clearTimeout(retryRef.current);
            retryRef.current = null;
          }
        };

        ws.onmessage = (ev: MessageEvent) => {
          let msg: { type: string; [k: string]: unknown };
          try {
            msg = JSON.parse(String(ev.data));
          } catch {
            return;
          }

          if (msg.type === "update") {
            setPeople((prev) =>
              prev.map((p) =>
                p.id === msg.id
                  ? {
                      ...p,
                      state: msg.state as OfficePersonState,
                      pos: msg.pos as OfficePerson["pos"],
                    }
                  : p,
              ),
            );
          } else if (msg.type === "snapshot") {
            // full snapshot refreshes people wholesale
            const ppl = msg.people as OfficePerson[];
            if (Array.isArray(ppl) && ppl.length > 0) {
              setPeople(ppl);
            }
          }
        };

        ws.onclose = () => {
          setWsStatus("off");
          if (closed) return;
          retryRef.current = setTimeout(connect, retryMs);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setWsStatus("off");
        retryRef.current = setTimeout(connect, retryMs);
      }
    }

    connect();

    return () => {
      closed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setWsStatus("off");
    };
  }, [enabled, retryMs]);

  return {
    people,
    wsStatus,
    /** push a state change to the server, which will broadcast to everyone */
    setState: (id: string, state: OfficePersonState, seat?: number) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "set-state", id, state, seat }));
      }
    },
  };
}
