/**
 * Route contract (R7a). Hash routing — no router library.
 * HOME = "office". Unknown hash -> office.
 */
export type Page = "office" | "kanban" | "memory" | "agents" | "calendar";

export const HOME: Page = "office";

/** All navigable pages in nav order (Calendar keeps its own useCronStore per R3). */
export const navigation: Page[] = ["office", "kanban", "memory", "agents", "calendar"];

/** "task board" -> "task-board"; viroom slugs are lowercase. */
export function pageSlug(page: Page): string {
  return page.replace(/\s+/g, "-").toLowerCase();
}

/**
 * "#/kanban?board=x" -> "kanban".
 * Unknown hash (or none) -> "office" (HOME).
 */
export function pageFromHash(hash: string): Page {
  if (!hash) return HOME;
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = clean.replace(/^\/+/, "").split(/[?#]/)[0] ?? "";
  const match = navigation.find(
    (p) => p === path || pageSlug(p) === path,
  );
  return match ?? HOME;
}
