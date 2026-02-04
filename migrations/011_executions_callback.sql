-- Executions: optional callback URL for async result (when response takes > 3s)
ALTER TABLE executions ADD COLUMN IF NOT EXISTS callback_url TEXT;
