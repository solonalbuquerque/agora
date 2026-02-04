-- Instance registration: self-hosted installation register/activate.

DO $$ BEGIN
  CREATE TYPE instance_status AS ENUM ('unregistered', 'pending', 'registered', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS instance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  status instance_status NOT NULL DEFAULT 'unregistered',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registered_at TIMESTAMPTZ,
  activation_token_hash TEXT,
  official_issuer_id UUID REFERENCES issuers(id),
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS instance_registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES instance(id) ON DELETE CASCADE,
  registration_code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instance_registration_requests_instance ON instance_registration_requests (instance_id);
