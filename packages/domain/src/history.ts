import { z } from "zod";
import { ledgerStatuses, shifts } from "./ledger.js";

const month = z.string().regex(/^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/);
const date = z.iso.date().refine((value) => !value.startsWith("0000"));
const period = {
  month: month.optional(), from: date.optional(), to: date.optional(), shift: z.enum(shifts).optional(),
};
const validatePeriod = (input: { month?: string | undefined; from?: string | undefined; to?: string | undefined }) => {
  if (input.month) return !input.from && !input.to;
  if (!input.from && !input.to) return true;
  if (!input.from || !input.to || input.from > input.to) return false;
  return Date.parse(input.to) - Date.parse(input.from) <= 365 * 86_400_000;
};

export const periodQuerySchema = z.object(period).strict().refine(validatePeriod);
export const historyQuerySchema = z.object({
  ...period,
  status: z.enum(ledgerStatuses).optional(),
  page: z.string().regex(/^[1-9]\d{0,4}$/).optional(),
}).strict().refine(validatePeriod);

export function monthRange(monthValue: string) {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const m = Number(monthText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const last = m === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
  return { from: `${monthValue}-01`, to: `${monthValue}-${last}` };
}
