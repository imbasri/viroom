// R7d — halaman Memory: apa yang dibawa tiap agen ke setiap sesi.
//
// Data dari GET /api/memory (envelope R7e). Read-only, tidak ada write ke profile.
// Shell (Layout, useSource) milik R7a — halaman ini hanya page dan panel isinya.
//
// Bentuk data mengikuti ruang/src/types.ts: MemoryDocument → MemoryStore (entry +
// batas karakter + persen), AgentMemory (satu profil Hermes atau `opencode`).

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Layout } from "@/lib/layout";
import { useSource } from "@/lib/use-source";

// --- types (locked untuk R7e; jangan diubah tanpa menyinkronkan backend) ---

export interface MemoryDocument {
  name: string;
  path: string;
  exists: boolean;
  chars?: number;
  modified?: string;
  content?: string;
  redacted?: boolean;
  truncated?: boolean;
  error?: string;
}

export interface MemoryStore extends MemoryDocument {
  entries: string[];
  limit: number;
  used: number;
  percent: number;
}

export interface MemorySettings {
  memoryEnabled: boolean;
  userProfileEnabled: boolean;
  writeApproval: boolean;
  provider?: string;
  memoryLimit: number;
  userLimit: number;
  source: string;
}

export interface AgentMemory {
  profile: string;
  label: string;
  path: string;
  kind: "hermes" | "opencode";
  available: boolean;
  reason?: string;
  soul?: MemoryDocument;
  memory?: MemoryStore;
  user?: MemoryStore;
  contextFiles: MemoryDocument[];
  settings?: MemorySettings;
  locked?: boolean;
}

export interface MemoryEnvelope {
  status: "ok" | "unavailable" | "error";
  data: { agents: AgentMemory[] } | null;
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

/** Label agen: pakai label dari server, jatuh ke nama profil. */
function labelOf(agent: AgentMemory): string {
  return agent.label || agent.profile || "Hermes";
}

/** Persentase tertinggi antara MEMORY.md dan USER.md — untuk ringkasan tab. */
export function peakPercent(agent: AgentMemory): number {
  return Math.max(agent.memory?.percent ?? 0, agent.user?.percent ?? 0);
}

/**
 * Ambil daftar agen dari envelope. R7e meng contractual `data.agents`; array
 * datar juga diterima supaya halaman tidak putih kalau bentuknya berubah.
 */
export function extractAgents(envelope: MemoryEnvelope | undefined): AgentMemory[] {
  if (!envelope) return [];
  const agents = envelope.data?.agents;
  if (Array.isArray(agents)) return agents;
  return [];
}

// --- sub-components ---

function DocumentBody({
  document,
  empty,
}: {
  document?: MemoryDocument;
  empty: string;
}) {
  if (!document || !document.exists)
    return <p className="text-sm text-zinc-500">{empty}</p>;
  if (document.error)
    return (
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
        {document.error}
      </p>
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        {number.format(document.chars ?? 0)} karakter · diperbarui{" "}
        {formatDateTime(document.modified)}
        {document.redacted ? " · ada baris yang disensor" : ""}
        {document.truncated ? " · hanya 256 KB pertama" : ""}
      </p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300">
        {document.content || "(file kosong)"}
      </pre>
    </div>
  );
}

/** Kartu MEMORY.md / USER.md: bar pemakaian, daftar entry, peringatan ≥80%. */
function StoreCard({
  title,
  subtitle,
  store,
  enabled,
  needle,
}: {
  title: string;
  subtitle: string;
  store?: MemoryStore;
  enabled: boolean;
  needle: string;
}) {
  const percent = store?.percent ?? 0;
  const tone = percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-emerald-500";
  const entries = (store?.entries ?? [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !needle || entry.toLowerCase().includes(needle));

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">{title}</p>
            <CardTitle className="text-base">{subtitle}</CardTitle>
          </div>
          {!enabled && (
            <span className="rounded border border-zinc-700 px-1.5 py-px text-[11px] text-zinc-400">
              nonaktif di config
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!store || !store.exists ? (
          <p className="text-sm text-zinc-500">
            Belum ada entry. <code className="text-zinc-400">{store?.path ?? "memories/"}</code>{" "}
            dibuat saat agen pertama kali menyimpan lewat tool{" "}
            <code className="text-zinc-400">memory</code>.
          </p>
        ) : store.error ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {store.error}
          </p>
        ) : (
          <>
            <div
              role="img"
              aria-label={`Pemakaian ${title} ${percent}%`}
              className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
            >
              <div
                className={cn("h-full", tone)}
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500">
              <b className="text-zinc-300">{percent}%</b> — {number.format(store.used)} /{" "}
              {number.format(store.limit)} karakter · {store.entries.length} entry · diperbarui{" "}
              {formatDateTime(store.modified)}
            </p>
            {percent >= 80 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Sudah di atas 80% batas. Hermes menolak tulisan yang melebihi batas, jadi agen
                perlu segera menggabungkan entry.
              </p>
            )}
            {entries.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {needle ? "Tidak ada entry yang cocok." : "File kosong."}
              </p>
            ) : (
              <ol className="space-y-2">
                {entries.map(({ entry, index }) => (
                  <li
                    key={index}
                    className="flex gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-2"
                  >
                    <span className="shrink-0 font-mono text-xs text-zinc-600">
                      §{index + 1}
                    </span>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-zinc-300">
                      {entry}
                    </p>
                    <small className="shrink-0 text-xs text-zinc-600">
                      {number.format(entry.length)} kar.
                    </small>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** SOUL.md + context files (AGENTS.md, HERMES.md, CLAUDE.md…) — bisa dibuka satu per satu. */
function DocumentSection({
  eyebrow,
  heading,
  document,
  empty,
  documents,
}: {
  eyebrow: string;
  heading: string;
  document?: MemoryDocument;
  empty: string;
  documents?: MemoryDocument[];
}) {
  const [open, setOpen] = useState<string | undefined>();
  const files = documents ?? (document ? [document] : []);

  return (
    <Card>
      <CardHeader>
        <p className="text-xs uppercase tracking-wide text-zinc-500">{eyebrow}</p>
        <CardTitle className="text-base">{heading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {files.length === 0 ? (
          <p className="text-sm text-zinc-500">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {files.map((item) => (
              <li key={item.path} className="space-y-2">
                <button
                  type="button"
                  aria-expanded={open === item.path}
                  onClick={() => setOpen(open === item.path ? undefined : item.path)}
                  className="flex w-full items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                >
                  <span aria-hidden="true">📄</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{item.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {number.format(item.chars ?? 0)} karakter
                  </span>
                </button>
                {open === item.path && <DocumentBody document={item} empty="" />}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Panel satu agen: baris pengaturan, dua store, SOUL.md, context files. */
function AgentPanel({ agent }: { agent: AgentMemory }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const settings = agent.settings;

  if (!agent.available)
    return (
      <Card className="border-amber-500/40">
        <CardHeader>
          <CardTitle className="text-base">Profil tidak tersedia</CardTitle>
          <CardDescription>
            {agent.reason ?? "Folder agen ini tidak bisa dibaca."}
          </CardDescription>
        </CardHeader>
      </Card>
    );

  // Modul profile-lock (PIN) belum ada di viroom — tampilkan lock notice, jangan
  // tombol palsu yang tidak melakukan apa pun. Angkat ke R7a/R7e.
  if (agent.locked)
    return (
      <Card className="border-zinc-700">
        <CardHeader>
          <CardTitle className="text-base">🔒 {labelOf(agent)} terkunci</CardTitle>
          <CardDescription>
            Memori, file, dan aktivitas agen ini privat. Unlock per browser belum ada di
            viroom (modul <code>profile-lock</code> belum di-port), jadi isinya sengaja tidak
            ditampilkan.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {agent.kind === "hermes" && (
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari entry memori…"
            aria-label="Cari entry memori"
            className="h-8 min-w-56 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          />
        )}
        <code className="min-w-0 truncate text-xs text-zinc-500">{agent.path}</code>
      </div>

      {settings && (
        <div className="flex flex-wrap gap-2" aria-label="Pengaturan memori">
          <span
            className={cn(
              "rounded border px-1.5 py-px text-[11px]",
              settings.memoryEnabled
                ? "border-zinc-700 text-zinc-300"
                : "border-zinc-800 text-zinc-600",
            )}
          >
            memory {settings.memoryEnabled ? "on" : "off"}
          </span>
          <span
            className={cn(
              "rounded border px-1.5 py-px text-[11px]",
              settings.userProfileEnabled
                ? "border-zinc-700 text-zinc-300"
                : "border-zinc-800 text-zinc-600",
            )}
          >
            user profile {settings.userProfileEnabled ? "on" : "off"}
          </span>
          <span
            className={cn(
              "rounded border px-1.5 py-px text-[11px]",
              settings.writeApproval
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-zinc-800 text-zinc-600",
            )}
          >
            write approval {settings.writeApproval ? "diperlukan" : "off"}
          </span>
          {settings.provider && (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[11px] text-amber-300">
              provider eksternal: {settings.provider}
            </span>
          )}
          <span className="rounded border border-zinc-800 px-1.5 py-px text-[11px] text-zinc-600">
            batas dari {settings.source}
          </span>
        </div>
      )}

      {agent.kind === "hermes" ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <StoreCard
              title="MEMORY.MD"
              subtitle="Catatan agen"
              store={agent.memory}
              enabled={settings?.memoryEnabled ?? true}
              needle={needle}
            />
            <StoreCard
              title="USER.MD"
              subtitle="Profil user"
              store={agent.user}
              enabled={settings?.userProfileEnabled ?? true}
              needle={needle}
            />
          </div>
          <DocumentSection
            eyebrow="SOUL.MD · IDENTITAS"
            heading="Siapa agen ini"
            document={agent.soul}
            empty="Tidak ada SOUL.md di profil ini. Hermes akan membuat default; sampai itu agen memakai identitas bawaan."
          />
        </>
      ) : (
        <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400">
          OpenCode bukan profil Hermes, jadi tidak punya MEMORY.md / USER.md. Yang ditampilkan di
          bawah hanya file rules globalnya.
        </p>
      )}

      <DocumentSection
        eyebrow="CONTEXT FILES"
        heading={
          agent.kind === "hermes" ? "AGENTS.md, HERMES.md, CLAUDE.md…" : "Rules global"
        }
        documents={agent.contextFiles ?? []}
        empty="Tidak ada context file di folder ini. Context file proyek (AGENTS.md, .hermes.md) biasanya ada di proyek yang sedang dikerjakan, bukan di profil."
      />
    </div>
  );
}

// --- halaman ---

export function Memory() {
  const { status, data, error, fetchedAt, reload } = useSource<MemoryEnvelope>(
    "/api/memory",
    30_000,
  );
  const [selected, setSelected] = useState<string | undefined>();
  const agents = extractAgents(data);
  const agent =
    agents.find((item) => item.profile === selected) ??
    agents.find((item) => item.available && !item.locked) ??
    agents[0];

  const description =
    "Apa yang dibawa tiap agen ke setiap sesi: identitas (SOUL.md), memori terbatas (MEMORY.md dan USER.md, disuntik sebagai snapshot beku di awal sesi), dan context file-nya. Read-only; rahasia disensor.";

  return (
    <Layout
      eyebrow="MEMORY & KNOWLEDGE"
      title="Memory"
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
          Memuat memori agen…
        </p>
      )}

      {status === "failed" && (
        <Card className="border-red-500/40">
          <CardHeader>
            <CardTitle className="text-base">Gagal memuat memori</CardTitle>
            <CardDescription>
              {error ?? "Backend tidak bisa dibaca. Source memori read-only."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" size="sm" onClick={reload}>
              Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {data?.status === "unavailable" && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base">Source memori tidak tersedia</CardTitle>
            <CardDescription>
              {data.error ??
                "CLI Hermes tidak menjawab, jadi memori agen tidak bisa ditampilkan."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {agents.length === 0 && status === "ready" && !data?.error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Belum ada memori agen</CardTitle>
            <CardDescription>
              Hermes tidak melaporkan profil apa pun, atau tidak ada profil yang memuat
              MEMORY.md.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {agent && (
        <>
          <div
            role="tablist"
            aria-label="Agen"
            className="flex flex-wrap gap-2 border-b border-zinc-800"
          >
            {agents.map((item) => {
              const active = item.profile === agent.profile;
              const summary = !item.available
                ? item.reason ?? "tidak tersedia"
                : item.kind === "opencode"
                  ? `${item.contextFiles?.length ?? 0} file rules`
                  : `${(item.memory?.entries.length ?? 0) + (item.user?.entries.length ?? 0)} entry · puncak ${peakPercent(item)}%`;
              const disabled = !item.available && !item.locked;
              return (
                <button
                  key={item.profile}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={disabled}
                  onClick={() => setSelected(item.profile)}
                  className={cn(
                    "-mb-px flex flex-col gap-0.5 rounded-t-md border border-b-0 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500",
                    active
                      ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                      : "border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                    disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                  )}
                >
                  <span className="text-sm font-medium">
                    {item.locked ? "🔒 " : ""}
                    {labelOf(item)}
                  </span>
                  <small className="text-xs text-zinc-500">{summary}</small>
                </button>
              );
            })}
          </div>
          <AgentPanel key={agent.profile} agent={agent} />
        </>
      )}
    </Layout>
  );
}

export default Memory;