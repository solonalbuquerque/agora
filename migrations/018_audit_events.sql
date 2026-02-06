-- B2.3 Audit log: human/admin/issuer/system actions
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'admin', 'issuer', 'system')),
  actor_id TEXT,
  target_type TEXT CHECK (target_type IN ('agent', 'wallet', 'service', 'instance', 'execution')),
  target_id TEXT,
  metadata JSONB,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_type ON audit_events (actor_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_id ON audit_events (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_request_id ON audit_events (request_id);
