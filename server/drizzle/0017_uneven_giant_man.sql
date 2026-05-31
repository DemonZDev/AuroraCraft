-- Graphify integration: per-project knowledge-graph state.
-- Hand-corrected to be graphify-only + idempotent. The drizzle auto-diff
-- re-emitted pre-existing objects (0011-0016) because the snapshot baseline
-- was stale; only the three graphify columns + enum below are new.
DO $$ BEGIN
 CREATE TYPE "public"."graphify_status" AS ENUM('none', 'building', 'ready', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "graphify_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "graphify_status" "public"."graphify_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "graphify_built_at" timestamp with time zone;
