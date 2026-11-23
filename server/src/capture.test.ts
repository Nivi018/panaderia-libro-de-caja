import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { test } from "node:test";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { businessDate } from "./capture.js";
import { connectDatabase } from "./db/index.js";
import { account, dailyLedgers, user } from "./db/schema.js";
import { serverEnv } from "./env.js";

test("la fecha del corte corresponde a la panadería y no a UTC", () => {
  assert.equal(businessDate("America/Mexico_City", new Date("2026-11-23T02:30:00Z")), "2026-11-22");
});

test("captura: permisos, guardado concurrente, arqueo exacto y cierre inmutable", async () => {
  const env = serverEnv();
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  const { db, pool } = connectDatabase();
  const now = () => new Date(Date.UTC(2100 + randomYear, 3, 10, 16));
  const randomYear = randomInt(7000);
  const app = createApp(createAuth(db, env), db, env, now);
  const ids = [randomUUID(), randomUUID()] as const;
  const [owner, other] = ids;
  const password = randomUUID();

  async function signIn(id: string) {
    const email = `${id}@example.invalid`;
    const hash = await hashPassword(password);
    await db.transaction(async (tx) => {
      await tx.insert(user).values({ id, email, name: "Cajero de prueba" });
      await tx.insert(account).values({ id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: hash });
    });
    const response = await app.request(`${origin}/api/auth/sign-in/email`, {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.getSetCookie().find((part) => part.includes("session_token="))?.split(";")[0];
    assert.ok(cookie);
    return cookie;
  }
  const request = (cookie: string, method: string, path = "", body?: object, sentOrigin = origin) =>
    app.request(`${origin}/api/ledgers${path}`, {
      method, headers: { origin: sentOrigin, "content-type": "application/json", cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  try {
    const [cashier, colleague] = await Promise.all([signIn(owner), signIn(other)]);
    const opening = { shift: "matutino", openingBalance: "100.00" };
    assert.equal((await request(cashier, "POST", "", opening, "https://example.invalid")).status, 403);
    const opened = await request(cashier, "POST", "", opening);
    assert.equal(opened.status, 201);
    const { ledger: { id } } = await opened.json() as { ledger: { id: string } };
    assert.equal((await request(cashier, "POST", "", opening)).status, 409);
    assert.equal((await request(colleague, "GET", `/${id}`)).status, 403);
    const sale = { type: "ingreso", category: "pan_dulce", concept: "Venta", amount: "12.10" };
    assert.equal((await request(cashier, "PUT", `/${id}/entries`, { version: 1, entries: [{ ...sale, amount: "12.100" }] })).status, 400);
    const payload = { version: 1, entries: [sale, { type: "egreso", category: "proveedores", concept: "Pago", amount: "2.20" }] };
    assert.equal((await request(colleague, "PUT", `/${id}/entries`, payload)).status, 403);
    const saves = await Promise.all([request(cashier, "PUT", `/${id}/entries`, payload), request(cashier, "PUT", `/${id}/entries`, payload)]);
    assert.deepEqual(saves.map((response) => response.status).sort(), [200, 409]);
    const closing = { version: 2, physicalCashCount: "109.85" };
    const rejected = await request(cashier, "POST", `/${id}/close`, closing);
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json() as { code: string }).code, "EXPLANATION_REQUIRED");
    const closed = await request(cashier, "POST", `/${id}/close`, { ...closing, explanation: "Faltaron cinco centavos." });
    assert.equal(closed.status, 200);
    const result = await closed.json() as {
      summary: object; entries: { concept: string }[]; ledger: { closingExplanation: string; version: number };
    };
    assert.deepEqual(result.summary, { income: "12.10", expenses: "2.20", balance: "109.90", difference: "-0.05" });
    assert.deepEqual(result.entries.map((entry) => entry.concept), ["Venta", "Pago"]);
    assert.equal(result.ledger.closingExplanation, "Faltaron cinco centavos.");
    assert.equal((await request(cashier, "PUT", `/${id}/entries`, { ...payload, version: result.ledger.version })).status, 409);
    assert.equal((await request(colleague, "GET", `/${id}`)).status, 200);

    const month = `${2100 + randomYear}-04`;
    await db.insert(dailyLedgers).values([
      ...Array.from({ length: 12 }, (_, index) => ({
        date: `${month}-${index + 11}`, createdBy: owner, shift: "matutino" as const,
        openingBalance: "1.00", physicalCashCount: "1.01", status: "cerrado" as const,
      })),
      { date: `${month}-23`, createdBy: owner, shift: "vespertino", openingBalance: "500.00" },
    ]);
    const totals = await request(colleague, "GET", `/summary?month=${month}`);
    assert.equal(totals.status, 200);
    assert.deepEqual(await totals.json(), {
      period: { from: `${month}-01`, to: `${month}-30` },
      cuts: 13, income: "12.10", expenses: "2.20", net: "9.90", difference: "0.07",
    });
    const first = await request(colleague, "GET", `?month=${month}`);
    assert.equal(first.status, 200);
    const firstPage = await first.json() as { page: number; total: number; rows: { status: string; summary: unknown }[] };
    assert.equal(firstPage.page, 1);
    assert.equal(firstPage.total, 14);
    assert.equal(firstPage.rows.length, 12);
    assert.equal(firstPage.rows[0]?.status, "abierto");
    assert.equal(firstPage.rows[0]?.summary, null);
    const second = await request(colleague, "GET", `?from=${month}-01&to=${month}-30&shift=matutino&status=cerrado&page=2`);
    assert.equal(second.status, 200);
    const secondPage = await second.json() as { page: number; rows: { id: string; summary: object }[] };
    assert.equal(secondPage.page, 2);
    assert.equal(secondPage.rows.length, 1);
    assert.equal(secondPage.rows[0]?.id, id);
    assert.deepEqual(secondPage.rows[0]?.summary, { income: "12.10", expenses: "2.20", difference: "-0.05" });
    assert.equal((await request(colleague, "GET", `?month=${month}&to=${month}-10`)).status, 400);
    assert.equal((await request(colleague, "GET", `/summary?from=${month}-20&to=${month}-10`)).status, 400);
    assert.equal((await request(colleague, "GET", `/summary?shift=vespertino&month=${month}`)).status, 200);
  } finally {
    try {
      await db.delete(dailyLedgers).where(eq(dailyLedgers.createdBy, owner));
      await db.delete(user).where(inArray(user.id, ids));
    } finally { await pool.end(); }
  }
});
