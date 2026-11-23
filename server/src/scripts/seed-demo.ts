import { eq } from "drizzle-orm";
import { businessDate } from "../capture.js";
import { connectDatabase } from "../db/index.js";
import { dailyLedgers, ledgerEntries, user } from "../db/schema.js";
import { databaseEnv } from "../env.js";

const database = new URL(databaseEnv().DATABASE_URL);
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]", "db"].includes(database.hostname)) {
  throw new Error("Los datos demo solo pueden cargarse en una base local y fuera de producción.");
}
if (process.argv[2] !== "--confirm-demo") {
  throw new Error("Usa npm run db:seed:demo -- --confirm-demo.");
}

type Scenario = { sweet: string; white: string; expense: string; physical: string | null; explanation?: string };
const days: Scenario[] = [
  { sweet: "2385.00", white: "1125.50", expense: "680.50", physical: "3280.00" },
  { sweet: "2510.00", white: "1084.50", expense: "792.00", physical: "3240.00", explanation: "Diferencia identificada durante el conteo de monedas." },
  { sweet: "2247.50", white: "1360.00", expense: "550.00", physical: "3510.00", explanation: "Sobraron $2.50 al contar la charola de monedas." },
  { sweet: "2845.00", white: "1296.00", expense: "1020.00", physical: "3571.00" },
  { sweet: "980.00", white: "615.50", expense: "195.00", physical: null },
];
const base = businessDate(process.env.BAKERY_TIME_ZONE ?? "America/Mexico_City");
const { db, pool } = connectDatabase();
try {
  const inserted = await db.transaction(async (tx) => {
    const [admin] = await tx.select({ id: user.id }).from(user).where(eq(user.email, "admin@panaderia.local"));
    if (!admin) throw new Error("Ejecuta db:seed primero para crear al administrador de desarrollo.");
    let total = 0;
    for (const [index, entry] of days.entries()) {
      const date = new Date(`${base}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - (days.length - 1 - index));
      const [cut] = await tx.insert(dailyLedgers).values({
        date: date.toISOString().slice(0, 10), shift: "matutino", createdBy: admin.id, openingBalance: "450.00",
        physicalCashCount: entry.physical, status: entry.physical === null ? "abierto" : "cerrado",
        notes: "Datos de demostración", closingExplanation: entry.explanation ?? null,
      }).onConflictDoNothing({ target: [dailyLedgers.date, dailyLedgers.shift] }).returning({ id: dailyLedgers.id });
      if (!cut) continue;
      await tx.insert(ledgerEntries).values([
        { ledgerId: cut.id, type: "ingreso", category: "pan_dulce", concept: "Ventas de pan dulce en mostrador", amount: entry.sweet, position: 0 },
        { ledgerId: cut.id, type: "ingreso", category: "pan_blanco", concept: "Ventas de bolillo y telera", amount: entry.white, position: 1 },
        { ledgerId: cut.id, type: "egreso", category: "insumos_harina_azucar", concept: "Compra de harina y azúcar", amount: entry.expense, position: 2 },
      ]);
      total++;
    }
    return total;
  });
  console.log(`${inserted} cortes de demostración agregados. No se modificaron cortes existentes.`);
} finally {
  await pool.end();
}
