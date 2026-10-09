// R7d — halaman Agents: daftar profil Hermes + OpenCode, status di kantor 3D.
//
// Consumes:
//   GET /api/profiles → { status, data: { profiles, openCode }, fetchedAt }
//   GET /api/office   → { stations: [{ id, state, activity, privacy }] }
//
// Layout (Layout) + polling (useSource) milik R7a. AgentGrid mirip ruang/src/pages/Agents.tsx
// tapi memakai komponen shadcn viroom (@/components/ui/*).

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Layout } from "@/lib/layout";
import { useSource } from "@/lib/use-source";

// --- types (harus sinkron dengan R7e) ---

export interface ProfileInfo {
  name: string;
  model: string;
  gateway: "Running" | "Stopped" | "Unknown";
}

export interface OfficeStation {
  id: string;
  state: string;
  activity?: string;
  privacy?: "locked" | "unlocked";
}

export interface ProfilesEnvelope {
  status: "ok" | "unavailable" | "error";
  data: { profiles: ProfileInfo[]; openCode?: string } | null;
  fetchedAt?: string;
  error?: string;
}

export interface OfficeEnvelope {
  status: "ok" | "unavailable" | "error";
  data: { stations: OfficeStation[] } | null;
  fetchedAt?: string;
  error?: string;
}

// --- helpers ---

const number = new Intl.NumberFormat("id-ID");

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString("id-ID") : value;
}

function agentLabel(name: string): string {
  return name || "Hermes";
}

/** Warna badge gateway: Running / Stopped / Unknown. */
function gatewayTone(gateway: ProfileInfo["gateway"]): string {
  switch (gateway) {
    case "Running":
      return "border-green-500/40 bg-green-500/10 text-green-300";
    case "Stopped":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    default:
      return "border-zinc-700 bg-zinc-800 text-zinc-400";
  }
}

// --- sub-components ---

function AgentCard({
  agent,
  model,
  gateway,
  kind,
  station,
}: {
  agent: string;
  model: string;
  gateway: string | undefined;
  kind: string;
  station?: OfficeStation;
}) {
  const inOffice = station
    ? `${station.state}${station.activity ? ` · ${station.activity}` : ""}`
    : "—";
  const lockedHere = station?.privacy === "locked";

  return (
    <Card
      className={cn(
        "flex flex-col gap-3",
        lockedHere && "border-amber-500/40",
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">{kind}</p>
            <CardTitle className="text-base">
              {lockedHere ? "🔒 " : ""}
              {agentLabel(agent)}
            </CardTitle>
            <CardDescription>
              {model ? `Model ${model}` : "tanpa model"}
            </CardDescription>
          </div>
          {gateway && (
            <span className={cn("rounded border px-1.5 py-0.5 text-[11px]", gatewayTone(gateway as ProfileInfo["gateway"]))}>
              {gateway}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <dl className="-m-1 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <div className="flex justify-between rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1">
            <dt className="text-zinc-500">Di kantor</dt>
            <dd
              className={cn(
                "truncate",
                lockedHere ? "text-amber-300" : "text-zinc-300",
              )}
              title={inOffice}
            >
              {inOffice}
            </dd>
          </div>
          <div className="flex justify-between rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1">
            <dt className="text-zinc-500">Gateway</dt>
            <dd className={cn("truncate", gateway ? "text-zinc-300" : "text-zinc-600")}>
              {gateway ? gateway : "Tidak ada (CLI tool)"}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

// --- page ---

export function Agents() {
  const { status, data, error, fetchedAt, reload } = useSource<ProfilesEnvelope>(
    "/api/profiles",
    30_000,
  );
  const office = useSource<OfficeEnvelope>("/api/office", 15_000);

  // /api/profiles mungkin belum ada di R7e — jadikan placeholder, jangan crash.
  const unavailable = status === "failed" || data?.status === "unavailable" || data?.status === "error";
  const profiles =
    status === "ready" && data?.data ? data.data.profiles : [];
  const openCode =
    status === "ready" && data?.data?.openCode ? data.data.openCode : undefined;

  const stations = useMemo(() => {
    const list = office.status === "ready" && office.data?.data?.stations;
    if (!Array.isArray(list)) return new Map<string, OfficeStation>();
    return new Map(list.map((s) => [s.id, s]));
  }, [office.status, office.data]);

  const cards: { id: string; model: string; gateway: string | undefined; kind: string }[] = [
    ...profiles.map((p) => ({ id: p.name, model: p.model, gateway: p.gateway, kind: "Hermes profile" })),
    ...(openCode ? [{ id: "opencode", model: openCode, gateway: undefined, kind: "OpenCode (CLI tool)" }] : []),
  ];

  const description =
    "Setiap profil Hermes di mesin ini adalah sebuah agen (dari `hermes profile list`). OpenCode, bila terpasang, muncul sebagai agen CLI terpisah. Daftar ini tidak dikonfigurasi manual: profil baru otomatis muncul di sini dan di kantor 3D.";

  return (
    <Layout
      eyebrow="CREW"
      title="Agents"
      description={description}
      actions={
        <Button variant="secondary" onClick={reload}>
          Muat ulang
        </Button>
      }
    >
      <p className="text-xs text-zinc-500" role="status">
        {fetchedAt ? `Diperbarui ${formatDateTime(fetchedAt)}` : "Menunggu pembacaan…"}
      </p>

      {(status === "idle" || status === "loading") && (
        <p className="text-sm text-zinc-400" role="status">
          Memuat daftar agen…
        </p>
      )}

      {unavailable && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base">Profiles tidak tersedia</CardTitle>
            <CardDescription>
              {error ??
                data?.error ??
                "Endpoint GET /api/profiles belum ada (akan datang)."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!unavailable && cards.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Belum ada agen</CardTitle>
            <CardDescription>
              Hermes tidak melaporkan profil apa pun, dan OpenCode tidak terpasang.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!unavailable && cards.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.id}>
              <AgentCard
                agent={card.id}
                model={card.model}
                gateway={card.gateway}
                kind={card.kind}
                station={stations.get(card.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}

export default Agents;
