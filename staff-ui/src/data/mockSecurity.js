// Mock data for B1/B2 staff screens until backend endpoints are implemented.
// Each screen uses these when API returns 404 or error.

export const securityOverview = {
  failed_auth_24h: { count: 12, pct_change: 8, link: '/staff/audit?event_type=AUTH_FAILURE' },
  rate_limit_violations_24h: { count: 34, pct_change: -15, link: '/staff/rate-limits?status=throttled' },
  blocked_webhooks_24h: { count: 2, pct_change: 0, link: '/staff/webhook-security?status=failing' },
  circuit_breakers_triggered: { count: 1, pct_change: 0, link: '/staff/circuit-breakers' },
  idempotency_replays_prevented: { count: 89, pct_change: 22, link: '/staff/executions' },
  callback_rejections: { count: 3, pct_change: -50, link: '/staff/callbacks?token_status=expired' },
};

export const rateLimits = {
  rows: [
    { scope: 'Agent', identifier: 'agt_abc123...', endpoint: 'POST /execute', requests: 45, limit: 100, window_sec: 60, status: 'OK', last_hit: '2025-02-06T14:32:10Z' },
    { scope: 'Agent', identifier: 'agt_xyz789...', endpoint: 'POST /execute', requests: 102, limit: 100, window_sec: 60, status: 'Throttled', last_hit: '2025-02-06T14:31:55Z' },
    { scope: 'IP', identifier: '192.168.1.100', endpoint: 'POST /agents/register', requests: 15, limit: 10, window_sec: 300, status: 'Throttled', last_hit: '2025-02-06T14:30:00Z' },
    { scope: 'Issuer', identifier: 'iss_def456...', endpoint: 'POST /credit', requests: 30, limit: 200, window_sec: 60, status: 'OK', last_hit: '2025-02-06T14:28:22Z' },
  ],
  total: 4,
};

export const webhookSecurity = {
  rows: [
    { service_id: 'svc_001', service_name: 'Image Processor', owner_agent_id: 'agt_abc123', webhook_url: 'https://processor.example.com/callback', status: 'Active', consecutive_failures: 0, last_error_reason: null, last_attempt: '2025-02-06T14:30:00Z' },
    { service_id: 'svc_002', service_name: 'Data Sync', owner_agent_id: 'agt_xyz789', webhook_url: 'https://sync.example.com/webhook', status: 'Paused', consecutive_failures: 5, last_error_reason: 'timeout', last_attempt: '2025-02-06T14:25:00Z' },
    { service_id: 'svc_003', service_name: 'Legacy API', owner_agent_id: 'agt_def456', webhook_url: 'http://127.0.0.1/callback', status: 'Paused', consecutive_failures: 1, last_error_reason: 'webhook_blocked_ssrf', last_attempt: '2025-02-06T14:20:00Z' },
  ],
  total: 3,
};

export const circuitBreakers = {
  rows: [
    { service_id: 'svc_001', service_name: 'Image Processor', breaker_state: 'Closed', failure_threshold: 5, failures_counted: 0, opened_at: null, last_success: '2025-02-06T14:30:00Z' },
    { service_id: 'svc_002', service_name: 'Data Sync', breaker_state: 'Open', failure_threshold: 5, failures_counted: 5, opened_at: '2025-02-06T14:25:00Z', last_success: '2025-02-06T13:00:00Z' },
  ],
  total: 2,
};

export const callbacks = {
  rows: [
    { execution_id: 'exec_001', service_id: 'svc_001', service_name: 'Image Processor', status: 'success', callback_token_status: 'Used', callback_received_at: '2025-02-06T14:30:05Z', rejected_reason: null },
    { execution_id: 'exec_002', service_id: 'svc_002', service_name: 'Data Sync', status: 'awaiting_callback', callback_token_status: 'Valid', callback_received_at: null, rejected_reason: null },
    { execution_id: 'exec_003', service_id: 'svc_002', service_name: 'Data Sync', status: 'failed', callback_token_status: 'Expired', callback_received_at: null, rejected_reason: 'token_expired' },
    { execution_id: 'exec_004', service_id: 'svc_001', service_name: 'Image Processor', status: 'failed', callback_token_status: 'Used', callback_received_at: '2025-02-06T14:00:00Z', rejected_reason: 'replay_detected' },
  ],
  total: 4,
};

export const requests = {
  rows: [
    { request_id: 'req_a1b2c3', method: 'POST', path: '/execute', status: 200, duration_ms: 245, agent_id: 'agt_abc123', issuer_id: null, instance_id: 'inst_1', timestamp: '2025-02-06T14:32:10Z' },
    { request_id: 'req_d4e5f6', method: 'POST', path: '/credit', status: 201, duration_ms: 12, agent_id: null, issuer_id: 'iss_def456', instance_id: 'inst_1', timestamp: '2025-02-06T14:32:05Z' },
    { request_id: 'req_g7h8i9', method: 'POST', path: '/execute', status: 429, duration_ms: 2, agent_id: 'agt_xyz789', issuer_id: null, instance_id: 'inst_1', timestamp: '2025-02-06T14:31:55Z' },
    { request_id: 'req_j0k1l2', method: 'GET', path: '/agents/me', status: 200, duration_ms: 5, agent_id: 'agt_abc123', issuer_id: null, instance_id: 'inst_1', timestamp: '2025-02-06T14:31:50Z' },
  ],
  total: 4,
};

export const auditLog = {
  rows: [
    { id: 1, event_type: 'STAFF_MINT', actor_type: 'admin', actor_id: null, target_type: 'wallet', target_id: 'agt_abc123', request_id: 'req_123', created_at: '2025-02-06T14:30:00Z', metadata: { coin: 'AGOTEST', amount_cents: 1000, ledger_id: 42 } },
    { id: 2, event_type: 'AGENT_BAN', actor_type: 'admin', actor_id: null, target_type: 'agent', target_id: 'agt_xyz789', request_id: null, created_at: '2025-02-06T14:25:00Z', metadata: {} },
    { id: 3, event_type: 'ISSUER_CREDIT', actor_type: 'issuer', actor_id: 'iss_def456', target_type: 'wallet', target_id: 'agt_abc123', request_id: 'req_456', created_at: '2025-02-06T14:20:00Z', metadata: { coin: 'AGOTEST', amount_cents: 500 } },
  ],
  total: 3,
};

export const metrics = {
  http_requests_per_minute: [
    { ts: '2025-02-06T14:25:00Z', count: 120 },
    { ts: '2025-02-06T14:26:00Z', count: 145 },
    { ts: '2025-02-06T14:27:00Z', count: 132 },
    { ts: '2025-02-06T14:28:00Z', count: 98 },
    { ts: '2025-02-06T14:29:00Z', count: 156 },
    { ts: '2025-02-06T14:30:00Z', count: 178 },
  ],
  execution_success_vs_failure: { success: 892, failed: 23 },
  webhook_latency: { p50_ms: 245, p95_ms: 890 },
  callback_success_rate: 0.96,
  wallet_transfers_per_coin: [
    { coin: 'AGOTEST', count: 156 },
    { coin: 'USDC', count: 45 },
  ],
};

export const health = {
  api_process: 'Healthy',
  database: 'Connected',
  redis: 'Connected',
  migrations: 'Up-to-date',
  last_readiness_check: '2025-02-06T14:32:00Z',
};

export const dataRetention = {
  execution_retention_days: 90,
  audit_log_retention_days: 365,
};

export const dataRetentionPreview = {
  executions_to_delete: 1250,
  audit_events_to_delete: 3400,
};
