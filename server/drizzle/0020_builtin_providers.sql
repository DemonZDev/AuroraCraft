-- Add OpenRouter and NVIDIA NIM as built-in providers.
-- Built-in providers cannot be deleted or have their endpoint/kind edited
-- through the admin API, but their models can be freely managed.

-- ── Step 1: Promote any existing non-builtin rows and migrate models ─────
-- If the admin previously created a non-builtin "openrouter" or "nvidia-nim"
-- provider (before this migration), convert it to builtin and deduplicate.
DO $$
DECLARE
  target_id   uuid;
  dup_id      uuid;
BEGIN
  -- OpenRouter: find any existing row (builtin or not)
  SELECT id INTO target_id FROM "ai_providers" WHERE slug = 'openrouter' LIMIT 1;
  IF FOUND THEN
    -- Promote to builtin, fix any stale config
    UPDATE "ai_providers" SET
      "name"       = 'OpenRouter',
      "base_url"   = 'https://openrouter.ai/api/v1',
      "kind"       = 'openai_compatible',
      "is_free"    = false,
      "is_active"  = true,
      "is_builtin" = true,
      "updated_at" = now()
    WHERE id = target_id;
    -- Migrate models from any other rows with the same slug
    FOR dup_id IN
      SELECT id FROM "ai_providers" WHERE slug = 'openrouter' AND id != target_id
    LOOP
      UPDATE "ai_models" SET "provider_id" = target_id WHERE "provider_id" = dup_id;
      DELETE FROM "ai_providers" WHERE id = dup_id;
    END LOOP;
  ELSE
    INSERT INTO "ai_providers" ("slug", "name", "base_url", "kind", "is_free", "is_active", "is_builtin")
    VALUES ('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'openai_compatible', false, true, true);
  END IF;

  -- NVIDIA NIM: find any existing row
  SELECT id INTO target_id FROM "ai_providers" WHERE slug = 'nvidia-nim' LIMIT 1;
  IF FOUND THEN
    UPDATE "ai_providers" SET
      "name"       = 'NVIDIA NIM',
      "base_url"   = 'https://integrate.api.nvidia.com/v1',
      "kind"       = 'openai_compatible',
      "is_free"    = true,
      "is_active"  = true,
      "is_builtin" = true,
      "updated_at" = now()
    WHERE id = target_id;
    FOR dup_id IN
      SELECT id FROM "ai_providers" WHERE slug = 'nvidia-nim' AND id != target_id
    LOOP
      UPDATE "ai_models" SET "provider_id" = target_id WHERE "provider_id" = dup_id;
      DELETE FROM "ai_providers" WHERE id = dup_id;
    END LOOP;
  ELSE
    INSERT INTO "ai_providers" ("slug", "name", "base_url", "kind", "is_free", "is_active", "is_builtin")
    VALUES ('nvidia-nim', 'NVIDIA NIM', 'https://integrate.api.nvidia.com/v1', 'openai_compatible', true, true, true);
  END IF;
END $$;

-- ── Step 2: Ensure rows exist (idempotent safety net) ───────────────────
INSERT INTO "ai_providers" ("slug", "name", "base_url", "kind", "is_free", "is_active", "is_builtin")
VALUES ('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'openai_compatible', false, true, true)
ON CONFLICT ("slug") DO UPDATE SET
  "is_builtin" = true,
  "updated_at" = now();--> statement-breakpoint

INSERT INTO "ai_providers" ("slug", "name", "base_url", "kind", "is_free", "is_active", "is_builtin")
VALUES ('nvidia-nim', 'NVIDIA NIM', 'https://integrate.api.nvidia.com/v1', 'openai_compatible', true, true, true)
ON CONFLICT ("slug") DO UPDATE SET
  "is_builtin" = true,
  "updated_at" = now();
