-- NIM jobs: persisted Prompt Enhancer / Error Prompt Maker jobs (refresh-safe).
-- Hand-edited to be idempotent (CLAUDE.md "Drizzle Migration Tracking Drift"):
-- safe to apply via `pnpm db:migrate` OR `psql -1 -f` if tracking is drifted.
CREATE TABLE IF NOT EXISTS "nim_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"nim_model" varchar(60) NOT NULL,
	"agent_model" varchar(100),
	"style" varchar(40),
	"input_json" jsonb,
	"result_json" jsonb,
	"history_json" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nim_jobs" ADD CONSTRAINT "nim_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nim_jobs" ADD CONSTRAINT "nim_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
