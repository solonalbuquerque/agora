-- Default coin: AGOTEST. Support longer coin symbols (up to 16 chars).

-- Widen coin column in wallets_coins
ALTER TABLE wallets_coins ALTER COLUMN coin TYPE VARCHAR(16);

-- Widen coin in dependent tables
ALTER TABLE wallets ALTER COLUMN coin TYPE VARCHAR(16);
ALTER TABLE ledger_entries ALTER COLUMN coin TYPE VARCHAR(16);

-- Insert default system coin AGOTEST
INSERT INTO wallets_coins (coin, name, qtd_cents) VALUES ('AGOTEST', 'AGORA Test Coin', 0)
ON CONFLICT (coin) DO NOTHING;
