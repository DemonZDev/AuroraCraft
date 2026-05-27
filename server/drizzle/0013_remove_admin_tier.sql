-- Migration 0013: Remove admin tier

-- First update any users with admin tier to paid
UPDATE users SET tier = 'paid' WHERE tier = 'admin';

-- Alter the enum to remove admin value
-- PostgreSQL doesn't support removing enum values directly, so we need to rename and recreate
ALTER TYPE user_tier RENAME TO user_tier_old;

CREATE TYPE user_tier AS ENUM ('free', 'paid');

-- Update the column to use the new enum
ALTER TABLE users ALTER COLUMN tier DROP DEFAULT;
ALTER TABLE users ALTER COLUMN tier TYPE user_tier USING tier::text::user_tier;
ALTER TABLE users ALTER COLUMN tier SET DEFAULT 'free';

-- Drop the old enum
DROP TYPE user_tier_old;
