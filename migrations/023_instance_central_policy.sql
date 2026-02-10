-- Cache of Central trust policy for this instance (fetched via GET /instances/me/policy).
CREATE TABLE IF NOT EXISTS instance_central_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES instance(id) ON DELETE CASCADE,
  trust_level TEXT,
  visibility_status TEXT,
  policy_json JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(instance_id)
);

CREATE INDEX IF NOT EXISTS idx_instance_central_policy_updated ON instance_central_policy(updated_at);
