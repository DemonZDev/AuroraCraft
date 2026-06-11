-- Pricing-page plan settings, admin-editable at runtime (Admin Panel → Plans).
-- Single-row table seeded with launch defaults; the API upserts against the one row.
-- Idempotent (see CLAUDE.md "Drizzle Migration Tracking Drift").
CREATE TABLE IF NOT EXISTS "plan_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_price_usd" double precision DEFAULT 5 NOT NULL,
	"pro_original_price_usd" double precision DEFAULT 12.5 NOT NULL,
	"pro_monthly_tokens" integer DEFAULT 5000 NOT NULL,
	"token_price_per_1k_usd" double precision DEFAULT 1 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "plan_settings" ("pro_price_usd", "pro_original_price_usd", "pro_monthly_tokens", "token_price_per_1k_usd", "features")
SELECT 5, 12.5, 5000, 1, '[
  {"label": "Project Workspace",       "free": true,  "pro": true},
  {"label": "Free Models Access",      "free": true,  "pro": true},
  {"label": "Download Plugin Jar",     "free": true,  "pro": true},
  {"label": "Download Project Files",  "free": false, "pro": true},
  {"label": "Fork Community Project",  "free": false, "pro": true},
  {"label": "Upload Project Zip",      "free": false, "pro": true},
  {"label": "Git Integrations",        "free": false, "pro": true},
  {"label": "Graphify Access",         "free": false, "pro": true},
  {"label": "Paid Models Access",      "free": false, "pro": true},
  {"label": "Web Search Access",       "free": false, "pro": true},
  {"label": "Prompt Enhancer",         "free": false, "pro": true},
  {"label": "Error Prompt Maker",      "free": false, "pro": true},
  {"label": "Code Review",             "free": false, "pro": true}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "plan_settings");
