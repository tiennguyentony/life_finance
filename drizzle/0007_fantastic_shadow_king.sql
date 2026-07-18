CREATE TYPE "public"."run_save_status" AS ENUM('active', 'archived');--> statement-breakpoint
ALTER TABLE "game_runs" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "game_runs" ADD COLUMN "save_status" "run_save_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "game_runs" ADD CONSTRAINT "game_runs_owner_user_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE UNIQUE INDEX "game_runs_one_active_save_per_owner_uidx" ON "game_runs" USING btree ("owner_user_id") WHERE "game_runs"."owner_user_id" IS NOT NULL AND "game_runs"."save_status" = 'active';--> statement-breakpoint
CREATE INDEX "game_runs_owner_save_updated_idx" ON "game_runs" USING btree ("owner_user_id","save_status","updated_at");
