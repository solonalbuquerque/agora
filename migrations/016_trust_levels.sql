-- Trust levels: editable definitions (name, benefits, auto-promotion rules)
CREATE TABLE IF NOT EXISTS trust_levels (
  level INT PRIMARY KEY,
  name TEXT NOT NULL,
  faucet_daily_limit_cents INT NOT NULL DEFAULT 5000,
  max_transfer_per_tx_cents INT,
  allow_paid_services BOOLEAN NOT NULL DEFAULT false,
  auto_rule_min_calls INT,
  auto_rule_min_success_rate_pct NUMERIC(5,2),
  auto_rule_min_account_days INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO trust_levels (level, name, faucet_daily_limit_cents, max_transfer_per_tx_cents, allow_paid_services, auto_rule_min_calls, auto_rule_min_success_rate_pct, auto_rule_min_account_days)
VALUES
  (0, 'New', 5000, NULL, false, 50, 95, 7),
  (1, 'Verified', 10000, NULL, true, 200, 98, 30),
  (2, 'Trusted', 25000, NULL, true, 500, 99, 90),
  (3, 'Partner', 50000, NULL, true, NULL, NULL, NULL)
ON CONFLICT (level) DO NOTHING;
