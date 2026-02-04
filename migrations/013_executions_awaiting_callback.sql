-- Allow intermediate status: awaiting_callback (request sent, waiting for service to POST result)
ALTER TABLE executions DROP CONSTRAINT IF EXISTS executions_status_check;
ALTER TABLE executions ADD CONSTRAINT executions_status_check
  CHECK (status IN ('pending', 'awaiting_callback', 'success', 'failed'));
