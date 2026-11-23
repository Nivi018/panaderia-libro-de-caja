import { roleSchema } from "@panaderia/domain";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import type { createAuth } from "./auth.js";
import { captureRoutes } from "./capture.js";
import type { connectDatabase } from "./db/index.js";
import { account, dailyLedgers, ledgerEntries, session, user, verification } from "./db/schema.js";

type Auth = ReturnType<typeof createAuth>;
type UserSession = Auth["$Infer"]["Session"];
export type ApiEnv = { Variables: { identity: UserSession; role: z.infer<typeof roleSchema> } };

export function createApp(auth: Auth, db: ReturnType<typeof connectDatabase>["db"], options: { BAKERY_TIME_ZONE: string; BAKERY_NAME: string; BETTER_AUTH_URL: string }, now = () => new Date()) {
  const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
    const path = c.req.path;
    if (path === "/api/auth" || path.startsWith("/api/auth/")) return next();
    const identity = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!identity) return c.json({ code: "UNAUTHENTICATED", message: "Inicia sesión." }, 401);

    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
      c.req.header("Origin") !== new URL(options.BETTER_AUTH_URL).origin) {
      return c.json({ code: "FORBIDDEN", message: "Origen no autorizado." }, 403);
    }

    const role = roleSchema.safeParse(identity.user.role);
    if (!role.success) return c.json({ code: "FORBIDDEN", message: "Rol no válido." }, 403);
    c.set("identity", identity);
    c.set("role", role.data);
    return next();
  });

  return new Hono<ApiEnv>()
    .get("/healthz", (c) => c.json({ status: "ok" as const }, 200))
    .get("/readyz", async (c) => {
      c.header("Cache-Control", "no-store");
      try {
        // PostgreSQL validates the tables and current schema without reading any ledger rows.
        await db.execute(sql`
          select ${user.role}, ${session.token}, ${account.id}, ${verification.id},
                 ${dailyLedgers.closingExplanation}, ${ledgerEntries.position}
          from ${user}, ${session}, ${account}, ${verification}, ${dailyLedgers}, ${ledgerEntries}
          limit 0
        `);
        return c.json({ status: "ready" as const }, 200);
      } catch {
        return c.json({ status: "unavailable" as const }, 503);
      }
    })
    .use("/api/*", requireSession)
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
    .get("/api/me", (c) => {
      const { user } = c.get("identity");
      return c.json({ id: user.id, name: user.name, email: user.email, role: c.get("role") }, 200);
    })
    .route("/api/ledgers", captureRoutes(db, options.BAKERY_TIME_ZONE, options.BAKERY_NAME, now))
    .notFound((c) => c.json({ code: "NOT_FOUND", message: "Ruta no encontrada." }, 404))
    .onError((error, c) => {
      if (error instanceof HTTPException && error.status === 400) {
        return c.json({ code: "INVALID_INPUT", message: "La solicitud no tiene un formato válido." }, 400);
      }
      console.error("Error de petición", c.req.method, c.req.path, error.name);
      return c.json({ code: "INTERNAL_ERROR", message: "No se pudo completar la operación." }, 500);
    });
}
