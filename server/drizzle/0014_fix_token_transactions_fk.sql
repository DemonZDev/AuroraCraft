-- Migration 0014: Fix token_transactions session_id FK to allow project deletion
-- When a project is deleted, agent_sessions cascade-deletes.
-- token_transactions.session_id must be set to NULL (not block the delete).

-- Drop the old constraint (it may have different names depending on how it was created)
ALTER TABLE token_transactions DROP CONSTRAINT IF EXISTS token_transactions_session_id_fkey;
ALTER TABLE token_transactions DROP CONSTRAINT IF EXISTS token_transactions_session_id_agent_sessions_id_fk;

-- Re-create with ON DELETE SET NULL
ALTER TABLE token_transactions ADD CONSTRAINT token_transactions_session_id_agent_sessions_id_fk
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL;
