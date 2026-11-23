import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { connectDatabase } from "./db/index.js";
import { serverEnv } from "./env.js";

const env = serverEnv();
const { db, pool } = connectDatabase();
const app = createApp(createAuth(db, env), db, env);

if (env.NODE_ENV === "production") {
  const root = fileURLToPath(new URL("../../client/dist", import.meta.url));
  const serveFiles = serveStatic({ root });
  const serveIndex = serveStatic({ root, path: "index.html" });
  app.use("*", async (c, next) => {
    if (!["GET", "HEAD"].includes(c.req.method) || c.req.path === "/api" || c.req.path.startsWith("/api/")) {
      return next();
    }
    const file = await serveFiles(c, async () => undefined);
    if (file) return file;
    return c.req.path.startsWith("/assets/") ? next() : serveIndex(c, next);
  });
}

const server = serve({ fetch: app.fetch, hostname: env.API_HOST, port: env.API_PORT }, (address) => {
  console.log(`API lista en ${address.address}:${address.port}`);
});

function shutdown() {
  server.close(() => {
    void pool.end().catch(() => { process.exitCode = 1; });
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
