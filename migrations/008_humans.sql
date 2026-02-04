-- Humans: email identity and verification (double opt-in). Link to agents via human_agents.

DO $$ BEGIN
  CREATE TYPE human_status AS ENUM ('pending', 'verified', 'banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE human_agent_role AS ENUM ('owner', 'operator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS humans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  status human_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_humans_email_lower ON humans (LOWER(email));

CREATE TABLE IF NOT EXISTS human_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_human_verifications_human_id ON human_verifications (human_id);
CREATE INDEX IF NOT EXISTS idx_human_verifications_expires ON human_verifications (expires_at);

CREATE TABLE IF NOT EXISTS human_agents (
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role human_agent_role NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (human_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_human_agents_agent_id ON human_agents (agent_id);
