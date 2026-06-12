ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "awaiting_retry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "last_promoted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_ready" ON "jobs" USING btree ("status","scheduled_at","effective_priority","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_dlq" ON "jobs" USING btree ("in_dlq","status");
