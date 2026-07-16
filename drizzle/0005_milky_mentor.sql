ALTER TABLE "ledger_transactions" ADD COLUMN "source_system" varchar(128);--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "category" varchar(128);--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "causal_reference_kind" varchar(16);--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "causal_reference_id" varchar(128);--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_complete_provenance" CHECK ((
        ("ledger_transactions"."source_system" IS NULL AND "ledger_transactions"."category" IS NULL AND "ledger_transactions"."causal_reference_kind" IS NULL AND "ledger_transactions"."causal_reference_id" IS NULL)
        OR
        ("ledger_transactions"."source_system" IS NOT NULL AND "ledger_transactions"."category" IS NOT NULL AND "ledger_transactions"."causal_reference_kind" IS NOT NULL AND "ledger_transactions"."causal_reference_id" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_causal_kind_valid" CHECK ("ledger_transactions"."causal_reference_kind" IS NULL OR "ledger_transactions"."causal_reference_kind" IN ('command', 'event', 'milestone', 'system'));