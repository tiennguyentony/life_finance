ALTER TABLE "accepted_commands" DROP CONSTRAINT "accepted_commands_resulting_snapshot_fk";
--> statement-breakpoint
ALTER TABLE "monthly_turn_records" DROP CONSTRAINT "monthly_turn_records_snapshot_fk";
--> statement-breakpoint
ALTER TABLE "run_state_snapshots" ADD COLUMN "snapshot_kind" varchar(32) DEFAULT 'legacy_command_result' NOT NULL;--> statement-breakpoint
ALTER TABLE "run_state_snapshots" ADD COLUMN "causal_command_id" varchar(128);--> statement-breakpoint
ALTER TABLE "run_state_snapshots" ADD CONSTRAINT "run_state_snapshots_kind_valid" CHECK ("run_state_snapshots"."snapshot_kind" IN ('run_start', 'checkpoint', 'before_event', 'after_event', 'before_milestone', 'after_milestone', 'terminal', 'migration', 'legacy_command_result'));