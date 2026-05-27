-- Migration 0012: Per-user provider API keys

-- Drop the old unique index on provider (was global)
DROP INDEX IF EXISTS idx_provider_api_keys_provider;

-- Add user_id column to provider_api_keys
ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Backfill: assign existing keys to admin user if any exist
-- (Admin can reassign later via UI)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM provider_api_keys WHERE user_id IS NULL) THEN
    UPDATE provider_api_keys SET user_id = (
      SELECT id FROM users WHERE role = 'admin' LIMIT 1
    ) WHERE user_id IS NULL;
  END IF;
END $$;

-- Make user_id NOT NULL after backfill
ALTER TABLE provider_api_keys ALTER COLUMN user_id SET NOT NULL;

-- Create composite unique index on (user_id, provider)
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_api_keys_user_provider ON provider_api_keys(user_id, provider);

-- Add index for user lookups
CREATE INDEX IF NOT EXISTS idx_provider_api_keys_user_id ON provider_api_keys(user_id);
