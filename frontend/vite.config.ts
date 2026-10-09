import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // host:true + strictPort — bind every interface and refuse to silently
    // move to 5174 when a stale dev server still owns 5173 (WSL2 forwards only
    // one of the ports, so a fallback port silently breaks the browser).
    host: true,
    strictPort: true,
    port: 5173,
    proxy: {
      // /api/office + /office-ws -> office3d server :3001, rest under /api -> Elysia :3000.
      "/api/office": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/office-ws": { target: "ws://127.0.0.1:3001", ws: true, changeOrigin: true },
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
});
