-- B2.1 Request ID correlation: store in critical tables
ALTER TABLE executions ADD COLUMN IF NOT EXISTS request_id TEXT;
CREATE INDEX IF NOT EXISTS idx_executions_request_id ON executions (request_id);

ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS request_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_request_id ON ledger_entries (request_id);
