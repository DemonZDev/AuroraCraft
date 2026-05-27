-- Add AI token system and user tier management

-- Add tier enum and token columns to users
CREATE TYPE user_tier AS ENUM ('free', 'paid', 'admin');
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier user_tier DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_tokens BIGINT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_used BIGINT DEFAULT 0;

-- Create provider API keys table
CREATE TABLE IF NOT EXISTS provider_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_api_keys_provider ON provider_api_keys(provider);

-- Create token transactions table
CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('grant', 'deduct', 'refund')),
  description TEXT,
  session_id UUID REFERENCES agent_sessions(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_created_at ON token_transactions(created_at);
