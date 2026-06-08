-- Rename the prompt-tool jobs table + column to the provider-agnostic naming.
-- The Prompt Enhancer / Error Prompt Maker were originally NVIDIA-NIM-only, so 0018
-- created "nim_jobs" with a "nim_model" column. They now run on ANY provider/model,
-- so the table becomes "prompt_tool_jobs" and the column becomes "tool_model" (matches
-- the Drizzle schema in server/src/db/schema/prompt-tool-jobs.ts).
--
-- Hand-edited to be fully idempotent (CLAUDE.md "Drizzle Migration Tracking Drift"):
-- safe to apply via `pnpm db:migrate` OR `psql -1 -f` if tracking is drifted, and safe
-- to re-run. Handles fresh DBs (0018 just created nim_jobs) and already-renamed DBs.
-- Existing constraint/index names (nim_jobs_pkey, *_fk) keep their old names — that is
-- cosmetic only; Drizzle does not reference them at runtime.

-- 1) Table rename: nim_jobs -> prompt_tool_jobs (only when the old table still exists
--    and the new one does not, so a re-run / pre-renamed DB is a no-op).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'nim_jobs')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'prompt_tool_jobs') THEN
    ALTER TABLE "nim_jobs" RENAME TO "prompt_tool_jobs";
  END IF;
END $$;--> statement-breakpoint

-- 2) Column rename: nim_model -> tool_model (only when the old column still exists and
--    the new one does not).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'prompt_tool_jobs' AND column_name = 'nim_model')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'prompt_tool_jobs' AND column_name = 'tool_model') THEN
    ALTER TABLE "prompt_tool_jobs" RENAME COLUMN "nim_model" TO "tool_model";
  END IF;
END $$;
