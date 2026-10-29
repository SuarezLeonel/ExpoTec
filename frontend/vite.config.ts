import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const apiProxy = (target: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  configure(proxy) {
    // Con el backend reiniciando (tsx --watch) el socket se corta; responder un
    // 503 claro evita que el navegador registre net::ERR_CONNECTION_REFUSED.
    proxy.on("error", (_error, _request, response) => {
      if ("writeHead" in response && !response.headersSent && !response.writableEnded) {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "El servidor no está disponible. Reintentá en unos segundos.",
            },
          }),
        );
      }
    });
  },
});
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
      proxy: { "/api": apiProxy(target), "/uploads": apiProxy(target) },
    },
    build: { outDir: "dist" },
  };
});
