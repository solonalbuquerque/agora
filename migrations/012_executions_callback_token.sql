-- Executions: token sent in X-Callback-Token so the service can prove the callback is valid
ALTER TABLE executions ADD COLUMN IF NOT EXISTS callback_token TEXT;
