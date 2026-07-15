CREATE TABLE "ai_audit_records" (
	"invocation_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid,
	"contract_version" smallint NOT NULL,
	"role" varchar(32) NOT NULL,
	"model" varchar(64) NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"attempt_count" smallint NOT NULL,
	"key_version" smallint NOT NULL,
	"initialization_vector" "bytea" NOT NULL,
	"authentication_tag" "bytea" NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_audit_records_contract_version_positive" CHECK ("ai_audit_records"."contract_version" > 0),
	CONSTRAINT "ai_audit_records_role_valid" CHECK ("ai_audit_records"."role" IN ('hostile_fed', 'teacher', 'onboarding', 'explanation')),
	CONSTRAINT "ai_audit_records_outcome_valid" CHECK ("ai_audit_records"."outcome" IN ('success', 'failure')),
	CONSTRAINT "ai_audit_records_attempt_count_bounded" CHECK ("ai_audit_records"."attempt_count" BETWEEN 1 AND 8),
	CONSTRAINT "ai_audit_records_key_version_positive" CHECK ("ai_audit_records"."key_version" > 0),
	CONSTRAINT "ai_audit_records_iv_length" CHECK (octet_length("ai_audit_records"."initialization_vector") = 12),
	CONSTRAINT "ai_audit_records_tag_length" CHECK (octet_length("ai_audit_records"."authentication_tag") = 16),
	CONSTRAINT "ai_audit_records_ciphertext_length" CHECK (octet_length("ai_audit_records"."ciphertext") BETWEEN 1 AND 2097152)
);
--> statement-breakpoint
ALTER TABLE "ai_audit_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_audit_records" ADD CONSTRAINT "ai_audit_records_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_audit_records_run_created_idx" ON "ai_audit_records" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_audit_records_role_created_idx" ON "ai_audit_records" USING btree ("role","created_at");
