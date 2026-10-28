import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_TARGET || "http://127.0.0.1:3100";
  const port = Number(env.VITE_PORT || 5173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("VITE_PORT debe ser un puerto entre 1024 y 65535.");
  new URL(target);
  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    plugins: [react()],
    server: {
      port,
      strictPort: true,
      proxy: { "/api": target, "/uploads": target },
    },
    build: { outDir: "dist" },
  };
});
