// R7b — Office3D page. r3f + OrbitControls scene, lazy-loaded 3D bundle with a 2D
// fallback. Data from GET /api/office?n=N on :3001 via useSource (15s poll).
//
// Adapts ruang src/pages/Office3D.tsx structure (Character walk/pose, DOM button
// labels outside the Canvas, Controls w/ damping + reset) but builds positions from
// viroom's lib/office3d-layout.ts stateToPosition — NOT ruang's
// createLayout(stations.length)/placementFor surface.

import { Component, lazy, Suspense, useState, type CSSProperties, type ReactNode } from "react";
import { useSource } from "@/lib/use-source";
import { useOfficeWs } from "@/lib/use-office-ws";
import { Layout } from "@/lib/layout";
import { createLayout, type Layout as OfficeLayout, type Vec3 } from "../../../lib/office3d-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** OfficeSnapshot shape from /api/office — see server/office-server.ts. */
export interface OfficePerson {
  id: string;
  state: "desk" | "meeting" | "lounge" | "away";
  seat?: number;
  pos: Vec3;
}
export interface OfficeSnapshot {
  n: number;
  layout: OfficeLayout;
  people: OfficePerson[];
  fetchedAt?: string;
}

/** Deterministic avatar colour from an agent id so the same name is always tinted alike. */
export function agentColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const palette = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4", "#f43f5e", "#84cc16"];
  return palette[hash % palette.length];
}

const STATE_LABEL: Record<OfficePerson["state"], string> = {
  desk: "Di meja",
  meeting: "Meeting",
  lounge: "Lounge",
  away: "Away",
};

// ---------------------------------------------------------------------------
// Lazy 3D bundle — chunk failure is caught by SceneBoundary below.
// ---------------------------------------------------------------------------

const OfficeScene = lazy(() => import("./OfficeScene"));

class SceneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// ---------------------------------------------------------------------------
// 2D fallback — grid of agent cards, also used while the 3D chunk loads.
// ---------------------------------------------------------------------------

function PresenceChip({ state }: { state: OfficePerson["state"] }) {
  const tone =
    state === "desk"
      ? "bg-zinc-800 border-zinc-700 text-zinc-300"
      : state === "meeting"
        ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
        : state === "lounge"
          ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
          : "bg-zinc-700 border-zinc-600 text-zinc-400";
  return (
    <span className={cn("inline-flex rounded border px-1.5 py-px text-[10px] font-medium", tone)}>
      {STATE_LABEL[state]}
    </span>
  );
}

export function OfficeFallback({
  people,
  onSelect,
  fetchedAt,
}: {
  people: OfficePerson[] | undefined;
  onSelect?: (id: string, trigger: HTMLElement | null) => void;
  fetchedAt?: string;
}) {
  if (!people || people.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kantor kosong</CardTitle>
          <CardDescription>Tidak ada agen terdeteksi di kantor.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <section className="office-2d">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {people.map((person) => {
          const color = agentColor(person.id);
          const style: CSSProperties = {
            backgroundColor: `${color}20`,
            borderColor: `${color}80`,
          };
          return (
            <button
              key={person.id}
              type="button"
              className="flex flex-col items-center gap-1.5 rounded-lg border bg-zinc-900 p-3 text-left transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
              onClick={(event) => onSelect?.(person.id, event.currentTarget)}
              style={style}
              title={`posisi x: ${person.pos.x}, z: ${person.pos.z}`}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-bold"
                style={{ backgroundColor: `${color}33`, color }}
              >
                {person.id.slice(0, 2).toUpperCase()}
              </span>
              <span className="font-medium">{person.id}</span>
              <PresenceChip state={person.state} />
            </button>
          );
        })}
      </div>
      {fetchedAt && (
        <p className="mt-4 text-xs text-zinc-500">
          Diperbarui{" "}
          {new Date(fetchedAt).toLocaleString("id-ID", { timeZoneName: "short" })}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const N = Number(import.meta.env.VITE_OFFICE_N ?? 12);

export default function Office3D() {
  const { status, data, error, fetchedAt, reload } = useSource<OfficeSnapshot>(
    `/api/office?n=${N}`,
    15_000,
  );

  const office = status === "ready" ? data : undefined;
  const initialPeople = office?.people ?? [];

  // Live presence layer — WS updates arrive instantly, 15s poll is the fallback.
  const { people: livePeople, wsStatus, setState: wsSetState } = useOfficeWs({
    initial: initialPeople,
    enabled: status === "ready",
  });

  // Use the live list if WS is connected, otherwise the last poll.
  const people = wsStatus === "live" ? livePeople : initialPeople;

  const [preferredView, setPreferredView] = useState<"3d" | "2d">("3d");
  const [selected, setSelected] = useState<string | undefined>();

  // Server already returns the layout it used; recreate only as a fallback so
  // the client never disagrees with /api/office positions.
  const layout: OfficeLayout = office?.layout ?? createLayout(N);

  const onSelect = (id: string) => setSelected(id);

  const wsBadge =
    wsStatus === "live" ? (
      <span className="ml-2 inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> live
      </span>
    ) : null;

  const actions = (
    <div className="flex items-center gap-2">
      <Button
        variant={preferredView === "2d" ? "default" : "secondary"}
        size="sm"
        onClick={() => setPreferredView("2d")}
        aria-pressed={preferredView === "2d"}
      >
        2D
      </Button>
      <Button
        variant={preferredView === "3d" ? "default" : "secondary"}
        size="sm"
        onClick={() => setPreferredView("3d")}
        aria-pressed={preferredView === "3d"}
      >
        3D
      </Button>
      <Button variant="secondary" size="sm" onClick={() => reload()}>
        Muat ulang
      </Button>
      {wsBadge}
    </div>
  );

  if (status === "failed" && !office) {
    return (
      <Layout eyebrow="ViRoom Office" title="Kantor" actions={actions}>
        <Card className="border-red-500/40">
          <CardHeader>
            <CardTitle>Gagal memuat kantor</CardTitle>
            <CardDescription>
              {error ??
                "Backend tidak dapat dihubungi. Periksa server office pada :3001."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" size="sm" onClick={() => reload()}>
              Coba lagi
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const loading = status === "idle" || status === "loading";
  const fallback = (
    <OfficeFallback
      people={loading ? undefined : people}
      onSelect={onSelect}
      fetchedAt={fetchedAt}
    />
  );

  const description =
    loading
      ? "Memuat data kantor dari /api/office…"
      : `${people.length} agen · posisi dari stateToPosition(lib/office3d-layout.ts), sama persis dengan output server office (:3001).`;

  return (
    <Layout
      eyebrow="ViRoom Office"
      title="Kantor 3D"
      description={description}
      actions={actions}
    >
      {fetchedAt && status === "ready" && (
        <p className="text-xs text-zinc-500">
          Diperbarui{" "}
          {new Date(fetchedAt).toLocaleString("id-ID", { timeZoneName: "short" })}
        </p>
      )}

      {wsStatus === "live" && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="text-zinc-500">Demo (karakter langsung jalan):</span>
          {(["desk", "meeting", "lounge", "away"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-700"
              onClick={() => {
                const target = people[0];
                if (target) wsSetState(target.id, s, target.seat);
              }}
            >
              {s === "desk" ? "Di meja" : s === "meeting" ? "Meeting" : s === "lounge" ? "Lounge" : "Away"}
            </button>
          ))}
        </div>
      )}

      {status === "failed" && office && (
        <p
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
          Refresh terakhir gagal ({error}); menampilkan data terakhir.
        </p>
      )}

      {preferredView === "2d" ? (
        fallback
      ) : (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <OfficeScene
              people={people}
              layout={layout}
              onSelect={onSelect}
              selected={selected}
              fetchedAt={fetchedAt}
            />
          </Suspense>
        </SceneBoundary>
      )}
    </Layout>
  );
}
