-- AGO Compliance Gate: instance status flagged, ledger types, issuers central, bridge_transfers, services export.

-- Instance status: add 'flagged' (compliant only when status = 'registered')
DO $$ BEGIN
  ALTER TYPE instance_status ADD VALUE 'flagged';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ledger entry types: add issuer_credit, hold_outbound, debit_outbound
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_type_check
  CHECK (type IN ('credit', 'debit', 'transfer', 'issuer_credit', 'hold_outbound', 'debit_outbound'));

-- Issuers: mark Central (official) issuer for AGO
ALTER TABLE issuers ADD COLUMN IF NOT EXISTS is_central BOOLEAN NOT NULL DEFAULT false;

-- Instance: ensure we can read official_issuer_id (already exists in 010)
-- No change needed.

-- Bridge transfers (AGO outbound: cross-instance / cashout)
DO $$ BEGIN
  CREATE TYPE bridge_transfer_kind AS ENUM ('cross_instance', 'cashout');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bridge_transfer_status AS ENUM ('pending', 'rejected', 'settled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bridge_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind bridge_transfer_kind NOT NULL,
  from_agent_id TEXT NOT NULL REFERENCES agents(id),
  coin VARCHAR(16) NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  to_instance_id TEXT,
  to_agent_id TEXT,
  destination_ref TEXT,
  status bridge_transfer_status NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  external_ref TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_transfers_external_ref ON bridge_transfers (external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bridge_transfers_status ON bridge_transfers (status);
CREATE INDEX IF NOT EXISTS idx_bridge_transfers_coin ON bridge_transfers (coin);
CREATE INDEX IF NOT EXISTS idx_bridge_transfers_created ON bridge_transfers (created_at);

-- Services: export visibility and status
DO $$ BEGIN
  CREATE TYPE service_visibility AS ENUM ('local', 'exported');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_export_status AS ENUM ('inactive', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE services ADD COLUMN IF NOT EXISTS visibility service_visibility NOT NULL DEFAULT 'local';
ALTER TABLE services ADD COLUMN IF NOT EXISTS export_status service_export_status NOT NULL DEFAULT 'inactive';
ALTER TABLE services ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ;
ALTER TABLE services ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE services ADD COLUMN IF NOT EXISTS export_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_services_visibility_export_status ON services (visibility, export_status);

-- Staff setting default for export_services_enabled (application reads from staff_settings)
-- No row needed; app uses staffSettings.get('export_services_enabled') and defaults to false.
INSERT INTO staff_settings (key, value) VALUES ('export_services_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
