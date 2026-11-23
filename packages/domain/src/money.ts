import { z } from "zod";

export const moneySchema = z.string().regex(/^(?:0|[1-9]\d{0,9})\.\d{2}$/, {
  message: "Usa un importe no negativo con dos decimales (ejemplo: 12.50).",
});
export const positiveMoneySchema = moneySchema.refine((value) => value !== "0.00", {
  message: "El movimiento debe ser mayor que cero.",
});

function cents(value: string): bigint {
  return BigInt(moneySchema.parse(value).replace(".", ""));
}

function decimal(value: bigint): string {
  const digits = (value < 0n ? -value : value).toString().padStart(3, "0");
  return `${value < 0n ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function summarizeLedger(
  openingBalance: string,
  physicalCashCount: string | null,
  entries: ReadonlyArray<{ type: "ingreso" | "egreso"; amount: string }>,
) {
  let income = 0n;
  let expenses = 0n;
  for (const entry of entries) {
    if (entry.type === "ingreso") income += cents(entry.amount);
    else expenses += cents(entry.amount);
  }
  const balance = cents(openingBalance) + income - expenses;
  return {
    income: decimal(income),
    expenses: decimal(expenses),
    balance: decimal(balance),
    difference: physicalCashCount === null ? null : decimal(cents(physicalCashCount) - balance),
  };
}
