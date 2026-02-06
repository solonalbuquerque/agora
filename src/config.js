'use strict';

require('dotenv').config();

const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://agora:agora@localhost:5432/agora',
  redisUrl: process.env.REDIS_URL || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  // Staff area (/staff): when enabled, register staff routes and optional UI
  enableStaff: process.env.ENABLE_STAFF === 'true',
  staffToken: process.env.STAFF_TOKEN || process.env.ADMIN_TOKEN || '',
  staffPassword: process.env.STAFF_PASSWORD || '',
  staffJwtSecret: process.env.STAFF_JWT_SECRET || process.env.HUMAN_JWT_SECRET || '',
  staff2faEnabled: process.env.STAFF_2FA_ENABLED === 'true',
  staff2faForced: process.env.STAFF_2FA_FORCED === 'true',
  staff2faSecret: process.env.STAFF_2FA_SECRET || '',
  defaultCoin: process.env.DEFAULT_COIN || 'AGOTEST',
  /** Reserved coin (AGO): only Central can mint; local mint/faucet blocked; outbound and issuer credit gated by compliance. */
  reservedCoin: (process.env.RESERVED_COIN || 'AGO').toString().slice(0, 16).toUpperCase(),
  /** Optional: instance ID for this deployment (used for compliance/manifest). If unset, first instance row is used. */
  instanceId: process.env.INSTANCE_ID || null,
  /** Optional: instance token (activation token from Center) for polling Central events and crediting agents. */
  instanceToken: process.env.INSTANCE_TOKEN || process.env.AGORA_INSTANCE_TOKEN || null,
  /** Secret that the Center sends in X-Central-Secret when calling execute-from-central (must match Center CENTRAL_EXECUTE_SECRET). */
  agoraCenterExecuteSecret: process.env.AGORA_CENTER_EXECUTE_SECRET || process.env.CENTRAL_EXECUTE_SECRET || null,
  enableFaucet: process.env.ENABLE_FAUCET === 'true',
  humanEmailDevReturnToken: process.env.HUMAN_EMAIL_DEV_RETURN_TOKEN === 'true',
  humanJwtSecret: process.env.HUMAN_JWT_SECRET || '',
  allowInsecureLink: process.env.ALLOW_INSECURE_LINK === 'true',

  // Public base URL for building X-Url-Callback sent to the service (e.g. https://api.agora.example.com or http://localhost:3000)
  agoraPublicUrl: (process.env.AGORA_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '') || `http://localhost:${Number(process.env.PORT) || 3000}`,
  /** URL of the AGORA-CENTER (Central) — connection endpoint for registration, activation, and sync. Optional. */
  agoraCenterUrl: (process.env.AGORA_CENTER_URL || process.env.CENTRAL_URL || '').replace(/\/$/, '') || null,
  // Webhook request in background: timeout in seconds before we close the socket (default 600 = 10 min)
  executePendingMaxSec: Number(process.env.EXECUTE_PENDING_MAX_SEC) || 600,

  // B1.1 Rate limiting (Redis with in-memory fallback)
  rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60,
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,

  // B1.2 Webhook hardening
  serviceWebhookTimeoutMs: Number(process.env.SERVICE_WEBHOOK_TIMEOUT_MS) || 30000,
  serviceWebhookMaxBytes: Number(process.env.SERVICE_WEBHOOK_MAX_BYTES) || 1024 * 1024, // 1 MiB
  serviceCbFails: Number(process.env.SERVICE_CB_FAILS) || 5,

  // B1.5 HMAC replay protection
  hmacToleranceSeconds: Number(process.env.HMAC_TOLERANCE_SECONDS) || 300, // 5 min

  // B2 Observability
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  executionRetentionDays: Number(process.env.EXECUTION_RETENTION_DAYS) || 0,
  auditRetentionDays: Number(process.env.AUDIT_RETENTION_DAYS) || 0,
};

module.exports = config;
