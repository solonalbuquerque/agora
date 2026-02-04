-- Execution log: requester, service, status, request/response, latency
CREATE TABLE IF NOT EXISTS executions (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  requester_agent_id TEXT NOT NULL REFERENCES agents(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  request JSONB,
  response JSONB,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_executions_requester ON executions (requester_agent_id);
CREATE INDEX IF NOT EXISTS idx_executions_service ON executions (service_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions (status);
CREATE INDEX IF NOT EXISTS idx_executions_created ON executions (created_at);
