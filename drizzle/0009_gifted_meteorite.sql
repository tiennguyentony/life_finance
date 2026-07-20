ALTER TABLE "ai_audit_records" DROP CONSTRAINT "ai_audit_records_role_valid";--> statement-breakpoint
ALTER TABLE "ai_audit_records" ADD CONSTRAINT "ai_audit_records_role_valid" CHECK ("ai_audit_records"."role" IN ('hostile_fed', 'scenario_director', 'teacher', 'onboarding', 'explanation', 'event_interpreter', 'banter_writer'));
