import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { connectDatabase } from "./db/index.js";
import { account, user } from "./db/schema.js";
import { serverEnv } from "./env.js";

test("Better Auth inicia y revoca sesiones, protege /api y no admite registro público", async () => {
  const env = serverEnv();
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  const { db, pool } = connectDatabase();
  const app = createApp(createAuth(db, env), db, env);
  const id = randomUUID();
  const email = `${id}@example.invalid`;
  const password = randomUUID();
  const url = (path: string) => `${origin}${path}`;
  const post = (path: string, data: Record<string, string>, cookie?: string) =>
    app.request(url(path), {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(data),
    });

  try {
    assert.equal((await app.request(url("/healthz"))).status, 200);
    const ready = await app.request(url("/readyz"));
    assert.equal(ready.status, 200);
    assert.equal(ready.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ready.json(), { status: "ready" });
    const missing = await app.request(url("/api/me"));
    assert.equal(missing.status, 401);
    assert.equal((await app.request(url("/api/otra-ruta"))).status, 401);
    const signUp = await post("/api/auth/sign-up/email", { name: "Prueba", email, password, role: "admin" });
    assert.ok(signUp.status >= 400 && signUp.status < 500);

    const stored = await hashPassword(password);
    await db.transaction(async (tx) => {
      await tx.insert(user).values({ id, email, name: "Prueba", emailVerified: true });
      await tx.insert(account).values({
        id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: stored,
      });
    });

    const signIn = await post("/api/auth/sign-in/email", { email, password });
    assert.equal(signIn.status, 200, await signIn.clone().text());
    const setCookie = signIn.headers.getSetCookie().find((part) => part.includes("session_token="));
    assert.ok(setCookie);
    assert.match(setCookie, /;\s*HttpOnly/i);
    const cookie = setCookie.split(";")[0];
    assert.ok(cookie);
    const me = await app.request(url("/api/me"), { headers: { cookie } });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), { id, email, name: "Prueba", role: "cajero" });
    assert.equal((await post("/api/auth/sign-out", {}, cookie)).status, 200);
    assert.equal((await app.request(url("/api/me"), { headers: { cookie } })).status, 401);
  } finally {
    try {
      await db.delete(user).where(eq(user.id, id));
    } finally {
      await pool.end();
    }
  }
});
