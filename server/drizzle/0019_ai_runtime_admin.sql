-- AI Runtime redesign: admin-managed AI providers, AI models, and MCPs.
-- Replaces the hardcoded config/ai-models.ts + config/nim-models.ts + Firecrawl-only MCP.
-- Hand-edited to be idempotent (CLAUDE.md "Drizzle Migration Tracking Drift"):
-- safe to apply via `pnpm db:migrate` OR `psql -1 -f` if tracking is drifted.

-- ── enums ──────────────────────────────────────────────────────────────
DO $$ BEGIN
 CREATE TYPE "public"."ai_provider_kind" AS ENUM('openai_compatible', 'zen');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."mcp_api_type" AS ENUM('non_api', 'api');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- ── ai_providers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(60) NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"kind" "ai_provider_kind" DEFAULT 'openai_compatible' NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_providers_slug_unique" UNIQUE("slug")
);--> statement-breakpoint

-- ── ai_models ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"show_name" varchar(100) NOT NULL,
	"real_name" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"usages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"type_tag" varchar(40) DEFAULT '' NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"input_per_1m" double precision DEFAULT 0 NOT NULL,
	"output_per_1m" double precision DEFAULT 0 NOT NULL,
	"cached_input_per_1m" double precision,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- ── mcps ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mcps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"config" text NOT NULL,
	"api_type" "mcp_api_type" DEFAULT 'non_api' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ── provider_api_keys: link rows to providers/MCPs (additive) ───────────
ALTER TABLE "provider_api_keys" ADD COLUMN IF NOT EXISTS "provider_id" uuid;--> statement-breakpoint
ALTER TABLE "provider_api_keys" ADD COLUMN IF NOT EXISTS "mcp_id" uuid;--> statement-breakpoint
ALTER TABLE "provider_api_keys" ALTER COLUMN "provider" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_api_keys" ADD CONSTRAINT "provider_api_keys_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_api_keys" ADD CONSTRAINT "provider_api_keys_mcp_id_mcps_id_fk" FOREIGN KEY ("mcp_id") REFERENCES "public"."mcps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- ── seed: built-in Zen provider + its two free agent models ─────────────
-- Zen has no OpenAI-compatible base URL (uses auth.json + `opencode/<id>` ids), so it
-- cannot be admin-added; it is seeded here and protected (is_builtin) from delete/endpoint edits.
INSERT INTO "ai_providers" ("slug", "name", "base_url", "kind", "is_free", "is_active", "is_builtin")
VALUES ('opencode', 'OpenCode Zen', '', 'zen', true, true, true)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

INSERT INTO "ai_models" ("provider_id", "show_name", "real_name", "description", "usages", "type_tag", "weight", "is_active")
SELECT p.id, 'DeepSeek V4 Flash', 'opencode/deepseek-v4-flash-free',
       'Fast free coding model with strong reasoning', '["agent"]'::jsonb, 'fast', 10, true
FROM "ai_providers" p WHERE p.slug = 'opencode'
AND NOT EXISTS (
  SELECT 1 FROM "ai_models" m WHERE m.provider_id = p.id AND m.real_name = 'opencode/deepseek-v4-flash-free'
);--> statement-breakpoint

INSERT INTO "ai_models" ("provider_id", "show_name", "real_name", "description", "usages", "type_tag", "weight", "is_active")
SELECT p.id, 'Nemotron 3 Super', 'opencode/nemotron-3-super-free',
       'NVIDIA free model optimized for coding', '["agent"]'::jsonb, 'fast', 20, true
FROM "ai_providers" p WHERE p.slug = 'opencode'
AND NOT EXISTS (
  SELECT 1 FROM "ai_models" m WHERE m.provider_id = p.id AND m.real_name = 'opencode/nemotron-3-super-free'
);
