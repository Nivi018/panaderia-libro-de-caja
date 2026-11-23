import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("../", import.meta.url)), ["API_PORT", "WEB_PORT", "VITE_HOST"]);
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      host: env.VITE_HOST ?? "127.0.0.1",
      port: Number(env.WEB_PORT ?? 5174),
      strictPort: true,
      proxy: { "/api": `http://127.0.0.1:${env.API_PORT ?? 3000}` },
    },
  };
});
