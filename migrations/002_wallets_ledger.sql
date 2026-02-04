-- Supported coins (seed: USD)
CREATE TABLE IF NOT EXISTS wallets_coins (
  coin CHAR(4) PRIMARY KEY,
  name TEXT NOT NULL,
  qtd_cents BIGINT NOT NULL DEFAULT 0
);

-- Balance per agent per coin
CREATE TABLE IF NOT EXISTS wallets (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  coin CHAR(4) NOT NULL REFERENCES wallets_coins(coin),
  balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  before_transaction_id BIGINT,
  PRIMARY KEY (agent_id, coin)
);

-- Ledger entries for audit and history
CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  coin CHAR(4) NOT NULL REFERENCES wallets_coins(coin),
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'transfer')),
  amount_cents BIGINT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_agent ON ledger_entries (agent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_coin ON ledger_entries (coin);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON ledger_entries (created_at);
