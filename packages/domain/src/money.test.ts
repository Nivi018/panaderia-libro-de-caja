import assert from "node:assert/strict";
import { test } from "node:test";
import { moneySchema, positiveMoneySchema, summarizeLedger } from "./money.js";

test("suma centavos sin redondeo y distingue cero de falta de conteo", () => {
  const entries = [
    { type: "ingreso", amount: "0.10" },
    { type: "ingreso", amount: "0.20" },
    { type: "egreso", amount: "1.30" },
  ] as const;
  assert.deepEqual(summarizeLedger("1.00", "0.00", entries), {
    income: "0.30", expenses: "1.30", balance: "0.00", difference: "0.00",
  });
  assert.equal(summarizeLedger("1.00", null, entries).difference, null);
});

test("valida numeric(12,2) por fila, pero no limita los agregados a ese rango", () => {
  assert.equal(moneySchema.safeParse("9999999999.99").success, true);
  for (const amount of ["10000000000.00", "0.001", "-0.01", "01.00", "1.00\n"]) {
    assert.equal(moneySchema.safeParse(amount).success, false);
  }
  assert.equal(positiveMoneySchema.safeParse("0.00").success, false);
  assert.equal(
    summarizeLedger("9999999999.99", "0.00", [{ type: "ingreso", amount: "0.01" }]).difference,
    "-10000000000.00",
  );
});
