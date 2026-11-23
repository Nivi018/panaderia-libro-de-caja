import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { connectDatabase } from "./index.js";
import { dailyLedgers, ledgerEntries, user } from "./schema.js";

const pgCode = (code: string) => (error: unknown) =>
  error instanceof Error && error.cause instanceof Error && "code" in error.cause && error.cause.code === code;

test("la migración aplica exactitud, unicidad, integridad del cierre y cascada", async () => {
  const { db, pool } = connectDatabase();
  const rollback = Symbol("rollback");
  const owner = randomUUID();
  const ledgerDate = "1900-01-01";

  try {
    await assert.rejects(db.transaction(async (tx) => {
      const [operator] = await tx.insert(user)
        .values({ id: owner, email: `${owner}@example.invalid`, name: "Prueba" }).returning();
      assert.equal(operator?.role, "cajero");

      const opening = { date: ledgerDate, shift: "completo", openingBalance: "0.10", createdBy: owner } as const;
      const [ledger] = await tx.insert(dailyLedgers).values(opening).returning();
      assert.ok(ledger);
      assert.equal(ledger.openingBalance, "0.10");
      assert.equal(ledger.physicalCashCount, null);
      assert.equal(ledger.version, 1);

      await assert.rejects(
        tx.transaction(async (sp) => { await sp.insert(dailyLedgers).values(opening); }),
        pgCode("23505"),
      );
      await assert.rejects(
        tx.transaction(async (sp) => {
          await sp.update(dailyLedgers).set({ status: "cerrado" }).where(eq(dailyLedgers.id, ledger.id));
        }),
        pgCode("23514"),
      );

      const entry = { ledgerId: ledger.id, type: "ingreso", category: "pan_dulce", concept: "Venta" } as const;
      await assert.rejects(
        tx.transaction(async (sp) => { await sp.insert(ledgerEntries).values({ ...entry, amount: "0.00" }); }),
        pgCode("23514"),
      );
      await tx.insert(ledgerEntries).values([{ ...entry, amount: "0.10" }, { ...entry, amount: "0.20" }]);
      const [total] = await tx.select({ sum: sql<string>`sum(${ledgerEntries.amount})::text` })
        .from(ledgerEntries).where(eq(ledgerEntries.ledgerId, ledger.id));
      assert.equal(total?.sum, "0.30");
      await tx.delete(dailyLedgers).where(eq(dailyLedgers.id, ledger.id));
      assert.deepEqual(await tx.select().from(ledgerEntries).where(eq(ledgerEntries.ledgerId, ledger.id)), []);
      throw rollback;
    }), (error) => error === rollback);
  } finally {
    await pool.end();
  }
});
