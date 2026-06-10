-- Remove the Kiro CLI bridge entirely. OpenCode is now the sole AI bridge.
-- Drops projects.bridge, the project_bridge enum, agent_sessions.bridge, and
-- agent_sessions.kiro_session_id.
--
-- Hand-edited to be fully idempotent (CLAUDE.md "Drizzle Migration Tracking Drift"):
-- safe to apply via `pnpm db:migrate` OR `psql -1 -f`, and safe to re-run.
-- IMPORTANT: projects.bridge depends on the project_bridge enum type, so the
-- column MUST be dropped BEFORE the type.

-- 1) Drop projects.bridge (depends on the project_bridge enum).
ALTER TABLE "projects" DROP COLUMN IF EXISTS "bridge";--> statement-breakpoint

-- 2) Drop agent_sessions.bridge (plain varchar — no enum dependency).
ALTER TABLE "agent_sessions" DROP COLUMN IF EXISTS "bridge";--> statement-breakpoint

-- 3) Drop agent_sessions.kiro_session_id.
ALTER TABLE "agent_sessions" DROP COLUMN IF EXISTS "kiro_session_id";--> statement-breakpoint

-- 4) Now the enum type has no dependents — drop it.
DROP TYPE IF EXISTS "project_bridge";
