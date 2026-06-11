-- Admin moderation: suspension flags for users and projects.
-- Idempotent (see CLAUDE.md "Drizzle Migration Tracking Drift").
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "suspended" boolean DEFAULT false NOT NULL;
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "suspended_reason" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "suspended" boolean DEFAULT false NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "suspended_reason" text;
