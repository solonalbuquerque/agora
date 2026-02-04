-- Services (capabilities). ID prefix "ser" is enforced in application code.
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  webhook_url TEXT NOT NULL,
  input_schema JSONB,
  output_schema JSONB,
  price_cents_usd BIGINT NOT NULL DEFAULT 0 CHECK (price_cents_usd >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_owner ON services (owner_agent_id);
CREATE INDEX IF NOT EXISTS idx_services_status ON services (status);
