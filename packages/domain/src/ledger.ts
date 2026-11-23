import { z } from "zod";
import { moneySchema, positiveMoneySchema } from "./money.js";

export const roles = ["admin", "cajero"] as const;
export const roleSchema = z.enum(roles);
export const shifts = ["matutino", "vespertino", "completo"] as const;
export const ledgerStatuses = ["abierto", "cerrado"] as const;
export const entryTypes = ["ingreso", "egreso"] as const;

export const categories = {
  ingreso: ["pan_dulce", "pan_blanco", "pasteleria", "pedidos", "otros"],
  egreso: ["insumos_harina_azucar", "gas_servicios", "proveedores", "nomina", "retiro_admin", "otros"],
} as const;

export const openLedgerSchema = z.object({
  shift: z.enum(shifts),
  openingBalance: moneySchema,
}).strict();

const movementFields = {
  id: z.uuid().optional(),
  concept: z.string().trim().min(1, "Escribe un concepto.").max(200),
  amount: positiveMoneySchema,
};
export const movementSchema = z.discriminatedUnion("type", [
  z.object({ ...movementFields, type: z.literal("ingreso"), category: z.enum(categories.ingreso) }),
  z.object({ ...movementFields, type: z.literal("egreso"), category: z.enum(categories.egreso) }),
]);
const version = z.number().int().positive().max(2147483647);
export const captureSchema = z.object({
  version,
  entries: z.array(movementSchema).max(500),
}).strict();
export const closeLedgerSchema = z.object({
  version,
  physicalCashCount: moneySchema,
  explanation: z.string().trim().max(500).optional(),
}).strict();
