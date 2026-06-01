-- AI Assistant feature: per-project columns + job/memory tables.
-- Hand-written idempotent (this deployment's migration tracking is drifted — see CLAUDE.md).
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "assistant_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "assistant_model" varchar(64) DEFAULT 'step-3.7-flash' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "assistant_enabled_snapshot" boolean;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "session_id" uuid,
  "kind" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'queued' NOT NULL,
  "model" varchar(64) NOT NULL,
  "input" jsonb NOT NULL,
  "draft" jsonb,
  "result" jsonb,
  "error" text,
  "estimated_tokens" bigint DEFAULT 0,
  "input_tokens" bigint DEFAULT 0,
  "output_tokens" bigint DEFAULT 0,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_jobs" ADD CONSTRAINT "assistant_jobs_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_jobs" ADD CONSTRAINT "assistant_jobs_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_jobs" ADD CONSTRAINT "assistant_jobs_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE set null;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_jobs_project_idx" ON "assistant_jobs" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_jobs_active_idx" ON "assistant_jobs" ("project_id","status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_memory" (
  "project_id" uuid PRIMARY KEY NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "version" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_memory" ADD CONSTRAINT "assistant_memory_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
