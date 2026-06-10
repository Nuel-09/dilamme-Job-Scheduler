CREATE TYPE "public"."job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_interval" AS ENUM('every_1_minute', 'every_5_minutes', 'every_1_hour');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(100) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"interval" "job_interval",
	"error" text,
	"in_dlq" boolean DEFAULT false NOT NULL,
	"effective_priority" integer DEFAULT 2 NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"in_ready_queue" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_dependencies" (
	"job_id" uuid NOT NULL,
	"depends_on_job_id" uuid NOT NULL,
	CONSTRAINT "job_dependencies_job_id_depends_on_job_id_pk" PRIMARY KEY("job_id","depends_on_job_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"event" varchar(100) NOT NULL,
	"message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "job_dependencies" ADD CONSTRAINT "job_dependencies_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_dependencies" ADD CONSTRAINT "job_dependencies_depends_on_job_id_jobs_id_fk" FOREIGN KEY ("depends_on_job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_scheduled_at_idx" ON "jobs" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_in_dlq_idx" ON "jobs" USING btree ("in_dlq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_in_ready_queue_idx" ON "jobs" USING btree ("in_ready_queue");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_logs_job_id_idx" ON "job_logs" USING btree ("job_id");
