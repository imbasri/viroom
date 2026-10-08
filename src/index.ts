// viroom server entry — wires the Elysia API + insights endpoint.
import { Elysia } from "elysia";
import { api } from "./api";
import { readInsights, readAllInsights, type Source } from "./hermes";

const PORT = Number(process.env.PORT ?? 3000);

const envelope = (s: Source<unknown>) => {
  if (s.availability === "ok") return { status: "ok" as const, data: s.data };
  return { status: s.availability as "unavailable" | "error", data: null, error: s.error ?? undefined };
};

export const app = new Elysia()
  .use(api)
  .get("/api/insights", async ({ query }) => {
    const profile = String(query.profile ?? "");
    const days = [1, 7, 30].includes(Number(query.days)) ? Number(query.days) : 7;
    if (profile && profile !== "all") {
      const s = await readInsights(profile, days);
      return envelope(s);
    }
    const s = await readAllInsights(days);
    return envelope(s);
  })
  .onError((err) => {
    console.error("viroom server error:", err);
  });

if (import.meta.main) {
  app.listen(PORT);
  console.log(`viroom listening on http://localhost:${PORT}`);
}

export default app;
