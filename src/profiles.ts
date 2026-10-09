// viroom profiles collector — sumber data `GET /api/profiles`.
// READ-ONLY terhadap `hermes` CLI: parse `hermes profile list` (format
// tabular dengan kolom Profile/Model/Gateway — port parser ruang server/mission-control
// `profileRows`) + deteksi OpenCode via `opencode --version` (bila PATH/WHICH
// tidak ada → dianggap tidak terpasang, data.openCode dihilangkan).
//
// Envelope mengikuti bentuk `/api/cron` (src/api.ts R3): availability
// "ok" → data terisi, error null; "unavailable"/"error" → data null, error
// terisi.
//
// FALLBACK: bila output `profile list` berupa daftar nama saja (port ruang
// `parseProfilesList`), gateway dianggap "Unknown" — tetap parseable dan
// testable lewat fake CLI tabular maupun bare-name.

import type { Source } from "./hermes";
import { hermesRun, systemRun, sourceOk, sourceUnavailable, sourceError, HERMES_BIN } from "./hermes";
import type { ProfileInfo, ProfilesPayload } from "./types";

export type { ProfileInfo, ProfilesPayload };

/** Gateway state tiga nilai. */
export type GatewayState = "Running" | "Stopped" | "Unknown";

// --- parser output `hermes profile list` ---

// Baris tabel: "Display Name (id)  model  gateway" — gateway di kolom terakhir.
const PROFILE_ROW_RE = /^(.+?)\s{2,}(\S+)\s+(running|stopped)(?:\s|$)/i;

/** Parse output tabular `hermes profile list` (kolom Gateway present). */
export function parseProfileTable(output: string): ProfileInfo[] | null {
  const all = output.replace(/\r/g, "").split("\n");
  const headerIndex = all.findIndex(
    (line) => /\bProfile\b/.test(line) && /\bModel\b/.test(line),
  );
  if (headerIndex < 0) return null; // bukan format tabel
  return all.slice(headerIndex + 1).flatMap((line): ProfileInfo[] => {
    const row = line.replace(/^[\s*>-]+/, "").replace(/^◆\s*/, "").trimEnd();
    if (!row || /^[\s─-]+(──*)?$/.test(row)) return [];
    const withGateway = row.match(PROFILE_ROW_RE);
    if (!withGateway) return [];
    const displayed = withGateway[1].trim().replace(/^◆\s*/, "");
    // Display name dirender "Display Name (id)"; id adalah nama profil stabil.
    const name = displayed.match(/\(([\w.-]+)\)$/)?.[1] ?? displayed;
    const gateway: GatewayState =
      withGateway[3].toLowerCase() === "running" ? "Running" : "Stopped";
    return [{ name, model: withGateway[2], gateway }];
  });
}

/** Parse daftar nama profil (tiap baris satu nama, seperti output lama). */
export function parseProfileNames(output: string): ProfileInfo[] {
  return output
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim().replace(/^\*\s*/, ""))
    .filter((l) => l.length > 0)
    .map((name) => ({ name, model: "Not configured", gateway: "Unknown" as GatewayState }));
}

/**
 * Parse `hermes profile list` → daftar profil.
 * - Tabel 3-kolom (Profile/Model/Gateway) → gateway Running/Stopped.
 * - Daftar nama saja → gateway Unknown.
 * - Output tidak dikenui → `null` (panggilan bisa fallback ke "No profiles").
 */
export function parseProfiles(output: string): ProfileInfo[] | null {
  const table = parseProfileTable(output);
  if (table !== null) return table;
  // Cek apakah output berisi sejumlah nama profil yang valid.
  const names = output
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim().replace(/^\*\s*/, ""))
    .filter((l) => l.length > 0 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(l));
  if (names.length === 0) {
    if (/^\s*No profiles\b/im.test(output)) return [];
    return null;
  }
  return names.map((name) => ({ name, model: "Not configured", gateway: "Unknown" as GatewayState }));
}

// --- collector ---

/**
 * Snapshot runtime: `hermes profile list` + `opencode --version` paralel.
 * - profile list gagal/tidak dikenali → availability "unavailable".
 * - openCode gagal → dihilangkan dari payload (agen CLI opsional).
 */
export async function collectProfiles(): Promise<Source<ProfilesPayload>> {
  const fetchedAt = new Date().toISOString();
  try {
    const [p, o] = await Promise.all([
      hermesRun(["profile", "list"]),
      detectOpenCode(),
    ]);
    if (p.exitCode !== 0)
      return sourceUnavailable<ProfilesPayload>(p.stderr.trim() || "hermes profile list unavailable");
    const profiles = parseProfiles(p.stdout);
    if (profiles === null)
      return sourceError<ProfilesPayload>("could not parse hermes profile list output");
    return sourceOk<ProfilesPayload>({
      profiles,
      ...(o ? { openCode: o } : {}),
      fetchedAt,
    });
  } catch (e) {
    return sourceError<ProfilesPayload>(e instanceof Error ? e.message : String(e));
  }
}

/** Versi OpenCode bila terpasang; `null` bila tidak ada / tidak terbaca. */
async function detectOpenCode(): Promise<string | null> {
  const which = await systemRun("which", ["opencode"]);
  if (which.exitCode !== 0) return null;
  const v = await systemRun("opencode", ["--version"]);
  if (v.exitCode !== 0) return null;
  const line = v.stdout.trim().split("\n").pop()?.trim() ?? "";
  return line || null;
}

// Guard dipakai oleh route /api/profiles (HERMITES_BIN bisa mengarah ke fake).
export { HERMES_BIN };