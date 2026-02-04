-- Issuers: trusted entities that can sign credit (mint) requests. No real PSP in core.

DO $$ BEGIN
  CREATE TYPE issuer_status AS ENUM ('active', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS issuers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status issuer_status NOT NULL DEFAULT 'active',
  public_key TEXT,
  secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_issuers_status ON issuers (status);

-- Ledger idempotency for admin mint and issuer credit: unique (coin, external_ref) when external_ref provided
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS external_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_entries_coin_external_ref
  ON ledger_entries (coin, external_ref) WHERE external_ref IS NOT NULL;
