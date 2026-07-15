CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('active', 'terminal');--> statement-breakpoint
CREATE TABLE "accepted_commands" (
	"run_id" uuid NOT NULL,
	"command_id" varchar(128) NOT NULL,
	"command_schema_version" integer NOT NULL,
	"command_type" varchar(64) NOT NULL,
	"expected_revision" integer NOT NULL,
	"resulting_revision" integer NOT NULL,
	"effective_month" char(7) NOT NULL,
	"payload" jsonb NOT NULL,
	"resulting_state_checksum" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accepted_commands_run_id_command_id_pk" PRIMARY KEY("run_id","command_id"),
	CONSTRAINT "accepted_commands_revision_sequence" CHECK ("accepted_commands"."expected_revision" >= 0 AND "accepted_commands"."resulting_revision" = "accepted_commands"."expected_revision" + 1),
	CONSTRAINT "accepted_commands_schema_version_positive" CHECK ("accepted_commands"."command_schema_version" > 0),
	CONSTRAINT "accepted_commands_month_format" CHECK ("accepted_commands"."effective_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "accepted_commands_checksum_format" CHECK ("accepted_commands"."resulting_state_checksum" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "accepted_commands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_secret_hash" char(64) NOT NULL,
	"access_secret_hash_version" smallint DEFAULT 1 NOT NULL,
	"state_schema_version" integer NOT NULL,
	"engine_version" varchar(32) NOT NULL,
	"current_revision" integer DEFAULT 0 NOT NULL,
	"current_month" char(7) NOT NULL,
	"status" "run_status" DEFAULT 'active' NOT NULL,
	"current_state" jsonb NOT NULL,
	"current_state_checksum" char(64) NOT NULL,
	"terminal_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_runs_revision_nonnegative" CHECK ("game_runs"."current_revision" >= 0),
	CONSTRAINT "game_runs_schema_version_positive" CHECK ("game_runs"."state_schema_version" > 0),
	CONSTRAINT "game_runs_secret_hash_version_positive" CHECK ("game_runs"."access_secret_hash_version" > 0),
	CONSTRAINT "game_runs_month_format" CHECK ("game_runs"."current_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "game_runs_checksum_format" CHECK ("game_runs"."current_state_checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "game_runs_terminal_consistency" CHECK (("game_runs"."status" = 'active' AND "game_runs"."terminal_at" IS NULL) OR ("game_runs"."status" = 'terminal' AND "game_runs"."terminal_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "game_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger_postings" (
	"run_id" uuid NOT NULL,
	"transaction_id" varchar(128) NOT NULL,
	"posting_index" integer NOT NULL,
	"account_id" varchar(128) NOT NULL,
	"debit_cents" bigint NOT NULL,
	"credit_cents" bigint NOT NULL,
	CONSTRAINT "ledger_postings_run_id_transaction_id_posting_index_pk" PRIMARY KEY("run_id","transaction_id","posting_index"),
	CONSTRAINT "ledger_postings_index_nonnegative" CHECK ("ledger_postings"."posting_index" >= 0),
	CONSTRAINT "ledger_postings_safe_integer_cents" CHECK ("ledger_postings"."debit_cents" BETWEEN 0 AND 9007199254740991 AND "ledger_postings"."credit_cents" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "ledger_postings_exactly_one_side" CHECK (("ledger_postings"."debit_cents" > 0 AND "ledger_postings"."credit_cents" = 0) OR ("ledger_postings"."credit_cents" > 0 AND "ledger_postings"."debit_cents" = 0))
);
--> statement-breakpoint
ALTER TABLE "ledger_postings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"run_id" uuid NOT NULL,
	"transaction_id" varchar(128) NOT NULL,
	"command_id" varchar(128) NOT NULL,
	"effective_month" char(7) NOT NULL,
	"reason_code" varchar(128) NOT NULL,
	"description" varchar(500) NOT NULL,
	"reverses_transaction_id" varchar(128),
	"transaction_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_run_id_transaction_id_pk" PRIMARY KEY("run_id","transaction_id"),
	CONSTRAINT "ledger_transactions_index_nonnegative" CHECK ("ledger_transactions"."transaction_index" >= 0),
	CONSTRAINT "ledger_transactions_month_format" CHECK ("ledger_transactions"."effective_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "ledger_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "run_state_snapshots" (
	"run_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"state_schema_version" integer NOT NULL,
	"engine_version" varchar(32) NOT NULL,
	"state" jsonb NOT NULL,
	"state_checksum" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_state_snapshots_run_id_revision_pk" PRIMARY KEY("run_id","revision"),
	CONSTRAINT "run_state_snapshots_revision_nonnegative" CHECK ("run_state_snapshots"."revision" >= 0),
	CONSTRAINT "run_state_snapshots_schema_version_positive" CHECK ("run_state_snapshots"."state_schema_version" > 0),
	CONSTRAINT "run_state_snapshots_checksum_format" CHECK ("run_state_snapshots"."state_checksum" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "run_state_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactional_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"command_id" varchar(128),
	"topic" varchar(128) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error_code" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactional_outbox_attempt_nonnegative" CHECK ("transactional_outbox"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "transactional_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accepted_commands" ADD CONSTRAINT "accepted_commands_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accepted_commands" ADD CONSTRAINT "accepted_commands_resulting_snapshot_fk" FOREIGN KEY ("run_id","resulting_revision") REFERENCES "public"."run_state_snapshots"("run_id","revision") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_transaction_fk" FOREIGN KEY ("run_id","transaction_id") REFERENCES "public"."ledger_transactions"("run_id","transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_state_snapshots" ADD CONSTRAINT "run_state_snapshots_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactional_outbox" ADD CONSTRAINT "transactional_outbox_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accepted_commands_run_revision_uidx" ON "accepted_commands" USING btree ("run_id","resulting_revision");--> statement-breakpoint
CREATE INDEX "accepted_commands_run_created_idx" ON "accepted_commands" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "game_runs_access_secret_hash_uidx" ON "game_runs" USING btree ("access_secret_hash");--> statement-breakpoint
CREATE INDEX "game_runs_status_updated_idx" ON "game_runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "ledger_postings_run_account_idx" ON "ledger_postings" USING btree ("run_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_run_index_uidx" ON "ledger_transactions" USING btree ("run_id","transaction_index");--> statement-breakpoint
CREATE INDEX "ledger_transactions_run_command_idx" ON "ledger_transactions" USING btree ("run_id","command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactional_outbox_idempotency_uidx" ON "transactional_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "transactional_outbox_dispatch_idx" ON "transactional_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "transactional_outbox_run_created_idx" ON "transactional_outbox" USING btree ("run_id","created_at");