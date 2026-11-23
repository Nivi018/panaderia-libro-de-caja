import { monthRange } from "@panaderia/domain";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { connectDatabase } from "./db/index.js";
import { dailyLedgers as cuts, ledgerEntries as entries, user } from "./db/schema.js";

type Db = ReturnType<typeof connectDatabase>["db"];
type Filter = {
  month?: string | undefined; from?: string | undefined; to?: string | undefined;
  shift?: typeof cuts.$inferSelect.shift | undefined;
};
type Listing = Filter & { page?: string | undefined; status?: typeof cuts.$inferSelect.status | undefined };
const PAGE_SIZE = 12;

function resolvePeriod(input: Filter, today: string) {
  return input.from && input.to ? { from: input.from, to: input.to } : monthRange(input.month ?? today.slice(0, 7));
}

const wherePeriod = ({ from, to }: ReturnType<typeof resolvePeriod>, shift: Filter["shift"]) => and(
  gte(cuts.date, from), lte(cuts.date, to), shift ? eq(cuts.shift, shift) : undefined,
);

const income = sql<string>`coalesce(sum(${entries.amount}) filter (where ${entries.type} = 'ingreso'), 0.00)`;
const expenses = sql<string>`coalesce(sum(${entries.amount}) filter (where ${entries.type} = 'egreso'), 0.00)`;
const decimal = (value: unknown) => sql<string>`(${value})::text`;

export async function listHistory(db: Db, input: Listing, today: string) {
  const period = resolvePeriod(input, today);
  const where = and(wherePeriod(period, input.shift), input.status ? eq(cuts.status, input.status) : undefined);
  const requested = Number(input.page ?? 1);
  return db.transaction(async (tx) => {
    const [countRow] = await tx.select({ total: count() }).from(cuts).where(where);
    const total = countRow?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requested, pages);
    const rows = await tx.select({
      id: cuts.id, date: cuts.date, shift: cuts.shift, status: cuts.status, operator: user.name,
    }).from(cuts).innerJoin(user, eq(user.id, cuts.createdBy)).where(where)
      .orderBy(desc(cuts.date), desc(cuts.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);

    const ids = rows.filter((row) => row.status === "cerrado").map((row) => row.id);
    const aggregates = ids.length ? await tx.select({
      id: cuts.id, income: decimal(income), expenses: decimal(expenses),
      difference: sql<string | null>`(${cuts.physicalCashCount} - (${cuts.openingBalance} + ${income} - ${expenses}))::text`,
    }).from(cuts).leftJoin(entries, eq(entries.ledgerId, cuts.id))
      .where(inArray(cuts.id, ids)).groupBy(cuts.id) : [];
    const summaries = new Map(aggregates.map(({ id, ...totals }) => [id, totals]));
    return {
      period, page, pages, pageSize: PAGE_SIZE, total,
      // Open operators' in-progress balances are not exposed in the shared history.
      rows: rows.map((row) => ({
        ...row, summary: summaries.get(row.id) ?? null,
      })),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function summarizeHistory(db: Db, input: Filter, today: string) {
  const period = resolvePeriod(input, today);
  const perCut = db.select({
    income: income.as("income"),
    expenses: expenses.as("expenses"),
    difference: sql<string>`${cuts.physicalCashCount} - (${cuts.openingBalance} + ${income} - ${expenses})`.as("difference"),
  }).from(cuts).leftJoin(entries, eq(entries.ledgerId, cuts.id))
    .where(and(wherePeriod(period, input.shift), eq(cuts.status, "cerrado"))).groupBy(cuts.id).as("per_cut");

  const [totals] = await db.select({
    cuts: count(),
    income: sql<string>`coalesce(sum(${perCut.income}), 0.00)::text`,
    expenses: sql<string>`coalesce(sum(${perCut.expenses}), 0.00)::text`,
    net: sql<string>`coalesce(sum(${perCut.income} - ${perCut.expenses}), 0.00)::text`,
    difference: sql<string>`coalesce(sum(${perCut.difference}), 0.00)::text`,
  }).from(perCut);
  if (!totals) throw new Error("No se pudo totalizar el periodo.");
  return { period, ...totals };
}
