-- 0024: Promote Fireworks AI to a built-in provider and add Google AI Studio as built-in.
--
-- Built-in providers cannot be deleted and their endpoint/kind are locked in the admin UI,
-- but their free/paid mode and their models stay fully editable (same rule as OpenRouter /
-- NVIDIA NIM from 0020 — only Zen is permanently free). Idempotent: safe to re-apply.

-- ── Step 1: Promote existing rows / migrate models, else insert ──────────
DO $$
DECLARE
  target_id uuid;
  dup_id    uuid;
BEGIN
  -- Fireworks AI → built-in (paid by default).
  SELECT id INTO target_id FROM "ai_providers" WHERE slug = 'fireworks-ai' LIMIT 1;
  IF FOUND THEN
    UPDATE "ai_providers" SET
      "name"       = 'Fireworks AI',
      "base_url"   = 'https://api.fireworks.ai/inference/v1',
      "kind"       = 'openai_compatible',
      "is_active"  = true,
      "is_builtin" = true,
      "updated_at" = now()
    WHERE id = target_id;
    FOR dup_id IN
      SELECT id FROM "ai_providers" WHERE slug = 'fireworks-ai' AND id != target_id
    LOOP
      UPDATE "ai_models" SET "provider_id" = target_id WHERE "provider_id" = dup_id;
      DELETE FROM "ai_providers" WHERE id = dup_id;
    END LOOP;
  ELSE
    INSERT INTO "ai_providers" ("slug", "name", "base_url", "kind", "is_free", "is_active", "is_builtin")
    VALUES ('fireworks-ai', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1', 'openai_compatible', false, true, true);
  END IF;

  -- Google AI Studio → built-in (paid). Uses Google's OpenAI-compatible endpoint.
  SELECT id INTO target_id FROM "ai_providers" WHERE slug = 'google-ai-studio' LIMIT 1;
  IF FOUND THEN
    UPDATE "ai_providers" SET
      "name"       = 'Google AI Studio',
      "base_url"   = 'https://generativelanguage.googleapis.com/v1beta/openai',
      "kind"       = 'openai_compatible',
      "is_active"  = true,
      "is_builtin" = true,
      "updated_at" = now()
    WHERE id = target_id;
    FOR dup_id IN
      SELECT id FROM "ai_providers" WHERE slug = 'google-ai-studio' AND id != target_id
    LOOP
      UPDATE "ai_models" SET "provider_id" = target_id WHERE "provider_id" = dup_id;
      DELETE FROM "ai_providers" WHERE id = dup_id;
    END LOOP;
  ELSE
    INSERT INTO "ai_providers" ("slug", "name", "base_url", "kind", "is_free", "is_active", "is_builtin")
    VALUES ('google-ai-studio', 'Google AI Studio', 'https://generativelanguage.googleapis.com/v1beta/openai', 'openai_compatible', false, true, true);
  END IF;
END $$;

-- ── Step 2: Idempotent safety net (ensure rows exist + are built-in) ─────
INSERT INTO "ai_providers" ("slug", "name", "base_url", "kind", "is_free", "is_active", "is_builtin")
VALUES ('fireworks-ai', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1', 'openai_compatible', false, true, true)
ON CONFLICT ("slug") DO UPDATE SET
  "is_builtin" = true,
  "updated_at" = now();--> statement-breakpoint

INSERT INTO "ai_providers" ("slug", "name", "base_url", "kind", "is_free", "is_active", "is_builtin")
VALUES ('google-ai-studio', 'Google AI Studio', 'https://generativelanguage.googleapis.com/v1beta/openai', 'openai_compatible', false, true, true)
ON CONFLICT ("slug") DO UPDATE SET
  "is_builtin" = true,
  "updated_at" = now();
