CREATE TABLE "monthly_tax_evidence" (
	"run_id" uuid NOT NULL,
	"trace_id" varchar(128) NOT NULL,
	"command_id" varchar(128) NOT NULL,
	"effective_month" char(7) NOT NULL,
	"evidence_checksum" char(64) NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_tax_evidence_run_id_trace_id_pk" PRIMARY KEY("run_id","trace_id"),
	CONSTRAINT "monthly_tax_evidence_month_format" CHECK ("monthly_tax_evidence"."effective_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "monthly_tax_evidence_checksum_format" CHECK ("monthly_tax_evidence"."evidence_checksum" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "monthly_tax_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "monthly_turn_records" (
	"run_id" uuid NOT NULL,
	"processed_month" char(7) NOT NULL,
	"command_id" varchar(128) NOT NULL,
	"resulting_revision" integer NOT NULL,
	"tax_trace_id" varchar(128) NOT NULL,
	"record_checksum" char(64) NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_turn_records_run_id_processed_month_pk" PRIMARY KEY("run_id","processed_month"),
	CONSTRAINT "monthly_turn_records_month_format" CHECK ("monthly_turn_records"."processed_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "monthly_turn_records_revision_positive" CHECK ("monthly_turn_records"."resulting_revision" > 0),
	CONSTRAINT "monthly_turn_records_checksum_format" CHECK ("monthly_turn_records"."record_checksum" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "monthly_turn_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "run_scenario_snapshots" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"catalog_version" varchar(64) NOT NULL,
	"snapshot_checksum" char(64) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_scenario_snapshots_checksum_format" CHECK ("run_scenario_snapshots"."snapshot_checksum" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "run_scenario_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "monthly_tax_evidence" ADD CONSTRAINT "monthly_tax_evidence_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_tax_evidence" ADD CONSTRAINT "monthly_tax_evidence_command_fk" FOREIGN KEY ("run_id","command_id") REFERENCES "public"."accepted_commands"("run_id","command_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_turn_records" ADD CONSTRAINT "monthly_turn_records_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_turn_records" ADD CONSTRAINT "monthly_turn_records_command_fk" FOREIGN KEY ("run_id","command_id") REFERENCES "public"."accepted_commands"("run_id","command_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_turn_records" ADD CONSTRAINT "monthly_turn_records_snapshot_fk" FOREIGN KEY ("run_id","resulting_revision") REFERENCES "public"."run_state_snapshots"("run_id","revision") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_turn_records" ADD CONSTRAINT "monthly_turn_records_tax_evidence_fk" FOREIGN KEY ("run_id","tax_trace_id") REFERENCES "public"."monthly_tax_evidence"("run_id","trace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_scenario_snapshots" ADD CONSTRAINT "run_scenario_snapshots_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_tax_evidence_run_month_uidx" ON "monthly_tax_evidence" USING btree ("run_id","effective_month");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_tax_evidence_run_command_uidx" ON "monthly_tax_evidence" USING btree ("run_id","command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_turn_records_run_command_uidx" ON "monthly_turn_records" USING btree ("run_id","command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_turn_records_run_revision_uidx" ON "monthly_turn_records" USING btree ("run_id","resulting_revision");
