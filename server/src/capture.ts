import { captureSchema, closeLedgerSchema, historyQuerySchema, openLedgerSchema, periodQuerySchema, summarizeLedger } from "@panaderia/domain";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "./app.js";
import type { connectDatabase } from "./db/index.js";
import { dailyLedgers, ledgerEntries, user } from "./db/schema.js";
import { listHistory, summarizeHistory } from "./history.js";

type Db = ReturnType<typeof connectDatabase>["db"];
const ledgerParam = z.object({ id: z.uuid() });
const invalid = { code: "INVALID_INPUT", message: "Revisa los datos del corte." } as const;

export function businessDate(zone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  return ["year", "month", "day"].map((name) => parts.find((part) => part.type === name)?.value).join("-");
}

type Actor = { id: string; role: "admin" | "cajero" };
type Ledger = typeof dailyLedgers.$inferSelect;
type Entry = typeof ledgerEntries.$inferSelect;
const owns = (actor: Actor, ledger: Ledger) => actor.role === "admin" || actor.id === ledger.createdBy;
const detail = (ledger: Ledger, entries: Entry[]) => ({
  ledger, entries, summary: summarizeLedger(ledger.openingBalance, ledger.physicalCashCount, entries),
});
const unavailable = { status: 404, error: { code: "NOT_FOUND", message: "No se encontró el corte." } } as const;
const forbidden = { status: 403, error: { code: "FORBIDDEN", message: "El corte pertenece a otro cajero." } } as const;
const conflict = { status: 409, error: { code: "STALE_LEDGER", message: "El corte cambió en otra sesión. Revisa la versión actual antes de continuar." } } as const;
const closed = { status: 409, error: { code: "CLOSED_LEDGER", message: "Este corte ya está cerrado." } } as const;
const explanationRequired = { status: 400, error: { code: "EXPLANATION_REQUIRED", message: "Explica la diferencia antes de cerrar." } } as const;
const duplicate = { code: "DUPLICATE_SHIFT", message: "Ya existe un corte para este turno." } as const;

function guard(ledger: Ledger | undefined, actor: Actor, version: number) {
  if (!ledger) return unavailable;
  if (!owns(actor, ledger)) return forbidden;
  if (ledger.status === "cerrado") return closed;
  if (ledger.version !== version) return conflict;
  return null;
}

export function captureRoutes(db: Db, zone: string, bakeryName: string, now: () => Date) {
  const route = new Hono<ApiEnv>();
  const actor = (c: { var: ApiEnv["Variables"] }): Actor => ({ id: c.var.identity.user.id, role: c.var.role });
  const readEntries = (conn: Pick<Db, "select">, id: string) => conn.select().from(ledgerEntries)
    .where(eq(ledgerEntries.ledgerId, id)).orderBy(asc(ledgerEntries.position), asc(ledgerEntries.createdAt), asc(ledgerEntries.id));
  const withOperator = async (conn: Pick<Db, "select">, ledger: Ledger, movements: Entry[]) => {
    const [operator] = await conn.select({ name: user.name }).from(user).where(eq(user.id, ledger.createdBy));
    if (!operator) throw new Error("No se encontró el responsable del corte.");
    return { ...detail(ledger, movements), operator: operator.name, bakeryName };
  };
  const invalidResult = { status: 400, error: invalid } as const;

  return route
    .get("/", zValidator("query", historyQuerySchema, (result, c) => {
      if (!result.success) return c.json({ ...invalid, message: "Selecciona un mes o un intervalo válido de hasta 366 días." }, 400);
    }), async (c) => c.json(await listHistory(db, c.req.valid("query"), businessDate(zone, now())), 200))
    .get("/summary", zValidator("query", periodQuerySchema, (result, c) => {
      if (!result.success) return c.json({ ...invalid, message: "Selecciona un mes o un intervalo válido de hasta 366 días." }, 400);
    }), async (c) => c.json(await summarizeHistory(db, c.req.valid("query"), businessDate(zone, now())), 200))
    .get("/today", async (c) => {
      const date = businessDate(zone, now());
      const rows = await db.select().from(dailyLedgers).where(eq(dailyLedgers.date, date)).orderBy(asc(dailyLedgers.shift));
      return c.json({ date, bakeryName, cuts: rows.map((row) => ({
        id: row.id, shift: row.shift, status: row.status, mine: row.createdBy === actor(c).id, editable: owns(actor(c), row),
      })) }, 200);
    })
    .post("/", zValidator("json", openLedgerSchema, (result, c) => {
      if (!result.success) return c.json(invalid, 400);
    }), async (c) => {
      const data = c.req.valid("json");
      const [ledger] = await db.insert(dailyLedgers).values({ ...data, date: businessDate(zone, now()), createdBy: actor(c).id })
        .onConflictDoNothing({ target: [dailyLedgers.date, dailyLedgers.shift] }).returning();
      return ledger ? c.json({ ...detail(ledger, []), operator: c.var.identity.user.name, bakeryName }, 201) : c.json(duplicate, 409);
    })
    .get("/:id", zValidator("param", ledgerParam, (result, c) => {
      if (!result.success) return c.json(invalid, 400);
    }), async (c) => {
      const { id } = c.req.valid("param");
      // Consistent version and movements even if someone saves during the request.
      const result = await db.transaction(async (tx) => {
        const [ledger] = await tx.select().from(dailyLedgers).where(eq(dailyLedgers.id, id)).for("share");
        if (!ledger) return unavailable;
        if (!owns(actor(c), ledger) && ledger.status !== "cerrado") return forbidden;
        return { status: 200, data: await withOperator(tx, ledger, await readEntries(tx, id)) } as const;
      });
      return result.status === 200 ? c.json(result.data, 200) : c.json(result.error, result.status);
    })
    .put("/:id/entries", zValidator("param", ledgerParam, (result, c) => {
      if (!result.success) return c.json(invalid, 400);
    }), zValidator("json", captureSchema, (result, c) => {
      if (!result.success) return c.json(invalid, 400);
    }), async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const result = await db.transaction(async (tx) => {
        const [ledger] = await tx.select().from(dailyLedgers).where(eq(dailyLedgers.id, id)).for("update");
        const error = guard(ledger, actor(c), input.version);
        if (error || !ledger) return error ?? unavailable;
        const before = new Map((await readEntries(tx, id)).map((entry) => [entry.id, entry]));
        const ids = input.entries.flatMap((entry) => entry.id ? [entry.id] : []);
        if (new Set(ids).size !== ids.length || ids.some((key) => !before.has(key))) return invalidResult;
        const after = new Set(ids);
        const removed = [...before.keys()].filter((key) => !after.has(key));
        if (removed.length) await tx.delete(ledgerEntries).where(and(eq(ledgerEntries.ledgerId, id), inArray(ledgerEntries.id, removed)));
        const ordered = input.entries.map((entry, position) => ({ ...entry, position }));
        const inserted = ordered.filter((entry) => !entry.id)
          .map(({ type, category, concept, amount, position }) => ({ ledgerId: id, type, category, concept, amount, position }));
        if (inserted.length) await tx.insert(ledgerEntries).values(inserted);
        for (const { id: entryId, type, category, concept, amount, position } of ordered) {
          if (!entryId) continue;
          const previous = before.get(entryId);
          if (previous?.type === type && previous.category === category && previous.concept === concept && previous.amount === amount && previous.position === position) continue;
          await tx.update(ledgerEntries).set({ type, category, concept, amount, position })
            .where(and(eq(ledgerEntries.ledgerId, id), eq(ledgerEntries.id, entryId)));
        }
        const [updated] = await tx.update(dailyLedgers).set({ version: ledger.version + 1 })
          .where(eq(dailyLedgers.id, id)).returning();
        if (!updated) throw new Error("No se actualizó la versión del corte.");
        return { status: 200, data: await withOperator(tx, updated, await readEntries(tx, id)) } as const;
      });
      return result.status === 200 ? c.json(result.data, 200) : c.json(result.error, result.status);
    })
    .post("/:id/close", zValidator("param", ledgerParam, (result, c) => {
      if (!result.success) return c.json(invalid, 400);
    }), zValidator("json", closeLedgerSchema, (result, c) => {
      if (!result.success) return c.json(invalid, 400);
    }), async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const result = await db.transaction(async (tx) => {
        const [ledger] = await tx.select().from(dailyLedgers).where(eq(dailyLedgers.id, id)).for("update");
        const error = guard(ledger, actor(c), input.version);
        if (error || !ledger) return error ?? unavailable;
        const entries = await readEntries(tx, id);
        const { difference } = summarizeLedger(ledger.openingBalance, input.physicalCashCount, entries);
        if (difference !== "0.00" && !input.explanation) return explanationRequired;
        const [updated] = await tx.update(dailyLedgers).set({
          status: "cerrado", version: ledger.version + 1,
          physicalCashCount: input.physicalCashCount, closingExplanation: input.explanation || null,
        }).where(eq(dailyLedgers.id, id)).returning();
        if (!updated) throw new Error("No se cerró el corte.");
        return { status: 200, data: await withOperator(tx, updated, entries) } as const;
      });
      return result.status === 200 ? c.json(result.data, 200) : c.json(result.error, result.status);
    });
}
