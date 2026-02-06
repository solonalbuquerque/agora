-- B1.3 Idempotency: optional idempotency_key per (agent, service)
ALTER TABLE executions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_executions_idempotency
  ON executions (requester_agent_id, service_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- B1.4 Callback hardening: expires_at and callback_received_at
ALTER TABLE executions ADD COLUMN IF NOT EXISTS callback_token_expires_at TIMESTAMPTZ;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS callback_received_at TIMESTAMPTZ;
