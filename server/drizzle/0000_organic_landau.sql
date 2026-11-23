CREATE TYPE "public"."entry_type" AS ENUM('ingreso', 'egreso');--> statement-breakpoint
CREATE TYPE "public"."ledger_shift" AS ENUM('matutino', 'vespertino', 'completo');--> statement-breakpoint
CREATE TYPE "public"."ledger_status" AS ENUM('abierto', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'cajero');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_identity_key" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "daily_ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"shift" "ledger_shift" NOT NULL,
	"opening_balance" numeric(12, 2) NOT NULL,
	"physical_cash_count" numeric(12, 2),
	"notes" text,
	"status" "ledger_status" DEFAULT 'abierto' NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_ledgers_date_shift_key" UNIQUE("date","shift"),
	CONSTRAINT "daily_ledgers_opening_balance_check" CHECK ("daily_ledgers"."opening_balance" between 0 and 9999999999.99),
	CONSTRAINT "daily_ledgers_cash_count_check" CHECK ("daily_ledgers"."physical_cash_count" between 0 and 9999999999.99),
	CONSTRAINT "daily_ledgers_closed_count_check" CHECK ("daily_ledgers"."status" <> 'cerrado' or "daily_ledgers"."physical_cash_count" is not null),
	CONSTRAINT "daily_ledgers_version_check" CHECK ("daily_ledgers"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"type" "entry_type" NOT NULL,
	"category" varchar(64) NOT NULL,
	"concept" varchar(200) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_check" CHECK ("ledger_entries"."amount" > 0 and "ledger_entries"."amount" <= 9999999999.99),
	CONSTRAINT "ledger_entries_concept_check" CHECK (btrim("ledger_entries"."concept") <> '')
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'cajero' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_ledgers" ADD CONSTRAINT "daily_ledgers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_id_daily_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."daily_ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "daily_ledgers_date_id_idx" ON "daily_ledgers" USING btree ("date","id");--> statement-breakpoint
CREATE INDEX "daily_ledgers_created_by_idx" ON "daily_ledgers" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "ledger_entries_ledger_capture_idx" ON "ledger_entries" USING btree ("ledger_id","created_at","id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");