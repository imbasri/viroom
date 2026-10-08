// viroom server entry — wires the Elysia API.
import { Elysia } from "elysia";
import { api } from "./api";

const PORT = Number(process.env.PORT ?? 3000);

export const app = new Elysia()
  .use(api)
  .onError((err) => {
    console.error("viroom server error:", err);
  });

if (import.meta.main) {
  app.listen(PORT);
  console.log(`viroom listening on http://localhost:${PORT}`);
}

export default app;
