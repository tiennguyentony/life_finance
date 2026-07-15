CREATE TABLE "run_state_migrations" (
	"run_id" uuid NOT NULL,
	"migration_version" varchar(64) NOT NULL,
	"source_schema_version" integer NOT NULL,
	"source_engine_version" varchar(32) NOT NULL,
	"target_schema_version" integer NOT NULL,
	"target_engine_version" varchar(32) NOT NULL,
	"source_revision" integer NOT NULL,
	"source_state_checksum" char(64) NOT NULL,
	"target_state" jsonb NOT NULL,
	"target_state_checksum" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_state_migrations_run_id_migration_version_pk" PRIMARY KEY("run_id","migration_version"),
	CONSTRAINT "run_state_migrations_version_progression" CHECK ("run_state_migrations"."source_schema_version" > 0 AND "run_state_migrations"."target_schema_version" > "run_state_migrations"."source_schema_version"),
	CONSTRAINT "run_state_migrations_revision_nonnegative" CHECK ("run_state_migrations"."source_revision" >= 0),
	CONSTRAINT "run_state_migrations_source_checksum_format" CHECK ("run_state_migrations"."source_state_checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "run_state_migrations_target_checksum_format" CHECK ("run_state_migrations"."target_state_checksum" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "run_state_migrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "run_state_migrations" ADD CONSTRAINT "run_state_migrations_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_state_migrations_run_created_idx" ON "run_state_migrations" USING btree ("run_id","created_at");