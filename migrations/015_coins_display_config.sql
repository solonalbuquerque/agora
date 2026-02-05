-- Add display configuration and circulating amount to wallets_coins
ALTER TABLE wallets_coins 
  ADD COLUMN IF NOT EXISTS circulating_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prefix VARCHAR(10) DEFAULT '',
  ADD COLUMN IF NOT EXISTS suffix VARCHAR(10) DEFAULT '',
  ADD COLUMN IF NOT EXISTS decimals INTEGER NOT NULL DEFAULT 2;

-- Add comment
COMMENT ON COLUMN wallets_coins.circulating_cents IS 'Total circulating amount (sum of all wallets balances for this coin)';
COMMENT ON COLUMN wallets_coins.prefix IS 'Display prefix (e.g. $, R$)';
COMMENT ON COLUMN wallets_coins.suffix IS 'Display suffix (e.g. USD, BRL)';
COMMENT ON COLUMN wallets_coins.decimals IS 'Number of decimal places for display';
