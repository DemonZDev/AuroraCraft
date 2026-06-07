-- API key routing: multiple keys per (user, PAID provider), each with a weight
-- (priority), a provider-dollar limit, and live spend tracking.
-- Hand-edited to be idempotent (CLAUDE.md "Drizzle Migration Tracking Drift"):
-- safe to apply via `pnpm db:migrate` OR `psql -1 -f` if tracking is drifted.

ALTER TABLE "provider_api_keys" ADD COLUMN IF NOT EXISTS "label" varchar(100);--> statement-breakpoint
ALTER TABLE "provider_api_keys" ADD COLUMN IF NOT EXISTS "weight" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_api_keys" ADD COLUMN IF NOT EXISTS "limit_usd" double precision;--> statement-breakpoint
ALTER TABLE "provider_api_keys" ADD COLUMN IF NOT EXISTS "used_usd" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_api_keys" ADD COLUMN IF NOT EXISTS "exhausted_at" timestamp with time zone;--> statement-breakpoint

-- Drop the legacy single-key-per-provider uniqueness (migration 0012). Multi-key
-- routing requires multiple paid keys to share the same (user_id, provider). The
-- one-key rule for FREE providers is now enforced in the admin route, not the DB.
DROP INDEX IF EXISTS "idx_provider_api_keys_user_provider";

