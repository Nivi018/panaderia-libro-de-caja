import { entryTypes, ledgerStatuses, roles, shifts } from "@panaderia/domain";
import { sql } from "drizzle-orm";
import {
  boolean, check, date, index, integer, numeric, pgEnum, pgTable,
  text, timestamp, unique, uuid, varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", roles);
export const ledgerShift = pgEnum("ledger_shift", shifts);
export const ledgerStatus = pgEnum("ledger_status", ledgerStatuses);
export const entryType = pgEnum("entry_type", entryTypes);

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("cajero"),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: instant("expires_at").notNull(),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_user_id_idx").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: instant("access_token_expires_at"),
  refreshTokenExpiresAt: instant("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("account_user_id_idx").on(t.userId),
  unique("account_provider_identity_key").on(t.providerId, t.accountId),
]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: instant("expires_at").notNull(),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

export const dailyLedgers = pgTable("daily_ledgers", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date", { mode: "string" }).notNull(),
  shift: ledgerShift("shift").notNull(),
  openingBalance: money("opening_balance").notNull(),
  physicalCashCount: money("physical_cash_count"),
  notes: text("notes"),
  closingExplanation: varchar("closing_explanation", { length: 500 }),
  status: ledgerStatus("status").notNull().default("abierto"),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  version: integer("version").notNull().default(1),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("daily_ledgers_date_shift_key").on(t.date, t.shift),
  index("daily_ledgers_date_id_idx").on(t.date, t.id),
  index("daily_ledgers_created_by_idx").on(t.createdBy),
  check("daily_ledgers_opening_balance_check", sql`${t.openingBalance} between 0 and 9999999999.99`),
  check("daily_ledgers_cash_count_check", sql`${t.physicalCashCount} between 0 and 9999999999.99`),
  check("daily_ledgers_closed_count_check", sql`${t.status} <> 'cerrado' or ${t.physicalCashCount} is not null`),
  check("daily_ledgers_version_check", sql`${t.version} >= 1`),
]);

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  ledgerId: uuid("ledger_id").notNull().references(() => dailyLedgers.id, { onDelete: "cascade" }),
  type: entryType("type").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  concept: varchar("concept", { length: 200 }).notNull(),
  amount: money("amount").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: instant("created_at").notNull().defaultNow(),
}, (t) => [
  index("ledger_entries_ledger_capture_idx").on(t.ledgerId, t.createdAt, t.id),
  check("ledger_entries_amount_check", sql`${t.amount} > 0 and ${t.amount} <= 9999999999.99`),
  check("ledger_entries_concept_check", sql`btrim(${t.concept}) <> ''`),
]);
