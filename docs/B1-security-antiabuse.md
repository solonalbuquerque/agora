# B1 — Security & Antiabuse Implementation

This document describes the implementation of the **B1 (Security & Antiabuse)** block in the AGORA core. All features are backward compatible with existing docker-compose, Swagger, and scripts.

---

## 1. Summary of Changes

| Area | Implementation |
|------|----------------|
| **B1.1 Rate limiting** | Redis-backed (in-memory fallback) per agent_id, issuer_id, IP. Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. HTTP 429 when exceeded. |
| **B1.2 Webhook hardening** | URL validation (http/https only; block localhost, private IPs, DNS rebinding). Configurable timeout and max body size. Circuit breaker per service_id; `POST /admin/services/:id/resume` to resume. |
| **B1.3 Idempotency** | Optional `X-Idempotency-Key` or body `idempotency_key` on `POST /execute`. Uniqueness per (agent_id, service_id, key). Duplicate returns original result, no double debit. |
| **B1.4 Callback hardening** | `callback_token` + `callback_token_expires_at`; one valid callback; 409 for duplicate, 410 for expired; `callback_received_at` stored. |
| **B1.5 Replay protection** | HMAC: Redis (or memory) store of (agent_id, timestamp, signature); reject duplicate and out-of-window. `HMAC_TOLERANCE_SECONDS` configurable. |
| **B1.6 Security logs** | Structured JSON logs for auth failure, rate limit, SSRF block, circuit breaker, idempotency hit, callback replay/expired. No secrets/signatures/tokens logged. |
| **B1.7 OpenAPI** | Schemas updated for 429, 409, 410, idempotency key, callback semantics. |
| **B1.8 README** | New "Security & Antiabuse" section. |

---

## 2. New and Modified Files

### New files

- `src/lib/security/rateLimit.js` — Rate limit middleware (Redis + in-memory), headers.
- `src/lib/security/webhookValidation.js` — SSRF URL validation, DNS resolve, private IP block.
- `src/lib/security/circuitBreaker.js` — Failure count per service, threshold, pause.
- `src/lib/security/securityLog.js` — Structured security/audit log; `attachRequestId` hook.
- `src/lib/security/hmacReplay.js` — Replay check and mark-seen for HMAC.
- `migrations/017_executions_idempotency_callback_security.sql` — `idempotency_key`, `callback_token_expires_at`, `callback_received_at`.
- `docs/B1-security-antiabuse.md` — This document.

### Modified files

- `src/config.js` — `rateLimitWindowSeconds`, `rateLimitMaxRequests`, `serviceWebhookTimeoutMs`, `serviceWebhookMaxBytes`, `serviceCbFails`, `hmacToleranceSeconds`.
- `src/lib/errors.js` — `rateLimit()`, `gone()`.
- `src/lib/redis.js` — `incrRateLimit` returns `limit`, `resetAt`; in-memory fallback with same shape.
- `src/lib/auth.js` — Uses `config.hmacToleranceSeconds`, `isReplay`/`markSeen`, auth failure security log.
- `src/app.js` — `attachRequestId` onRequest hook.
- `src/db/executions.js` — `create(..., idempotencyKey)`, `findByIdempotency`, `callback_token_expires_at`/`callback_received_at`, `updateResultIfPending` sets `callback_received_at`.
- `src/routes/executions.js` — Idempotency, webhook validation, circuit breaker, secure `httpRequest`, callback 409/410, rate limit.
- `src/routes/admin.js` — Rate limit, `POST /admin/services/:id/resume`.
- `src/routes/agents.js` — Rate limit on `POST /register`.
- `src/routes/human.js` — Rate limit on `POST /register`.
- `src/routes/wallet.js` — Rate limit on `POST /:coin/transfer`.
- `src/routes/issuer.js` — Rate limit on `POST /credit`.
- `src/routes/faucet.js` — Rate limit on `POST /faucet`.
- `.env.example` — New B1-related variables.
- `README.md` — Security & Antiabuse section and env table.

---

## 3. New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_SECONDS` | 60 | Rate limit window (seconds). |
| `RATE_LIMIT_MAX_REQUESTS` | 100 | Max requests per window per key. |
| `SERVICE_WEBHOOK_TIMEOUT_MS` | 30000 | Webhook call timeout (ms). |
| `SERVICE_WEBHOOK_MAX_BYTES` | 1048576 | Max webhook request/response body size (bytes). |
| `SERVICE_CB_FAILS` | 5 | Consecutive webhook failures before service is paused. |
| `HMAC_TOLERANCE_SECONDS` | 300 | HMAC timestamp window and replay cache TTL. |

---

## 4. Example curl Commands

### Execute with idempotency

```bash
# First call: creates execution and debits
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: <agent-uuid>" \
  -H "X-Timestamp: <unix-sec>" \
  -H "X-Signature: <hmac-hex>" \
  -H "X-Idempotency-Key: my-unique-key-123" \
  -d '{"service_id":"<service-uuid>","request":{}}'

# Second call with same key: returns same execution, no new debit
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: <agent-uuid>" \
  -H "X-Timestamp: <new-unix-sec>" \
  -H "X-Signature: <new-hmac-hex>" \
  -H "X-Idempotency-Key: my-unique-key-123" \
  -d '{"service_id":"<service-uuid>","request":{}}'
```

### Valid callback

```bash
# Service calls back with token received in X-Callback-Token
curl -X POST "http://localhost:3000/executions/<execution-uuid>" \
  -H "Content-Type: application/json" \
  -H "X-Callback-Token: <token-from-webhook-headers>" \
  -d '{"success":true,"result":"done"}'
# 200 + { "ok": true, "data": { "success": true, "result": "done" } }
```

### Webhook blocked (SSRF)

When the service’s `webhook_url` is set to e.g. `http://127.0.0.1/callback`, the core validates the URL before calling. The request is rejected as SSRF: the execution is created and immediately marked **failed** with `response.error === 'webhook_blocked_ssrf'`. No outbound call is made. Example response body (execution data):

```json
{
  "ok": true,
  "data": {
    "id": 1,
    "uuid": "...",
    "status": "failed",
    "response": {
      "error": "webhook_blocked_ssrf",
      "message": "Blocked hostname (loopback)"
    }
  }
}
```

### Circuit breaker activated

1. Configure a service whose webhook fails (e.g. invalid host or timeout) and set `SERVICE_CB_FAILS=3` for quick testing.
2. Trigger `POST /execute` three times (same service). After the third failure, the service is set to **paused**.
3. Further `POST /execute` for that service returns 400 "Service is not active".
4. Resume:

```bash
curl -X POST "http://localhost:3000/admin/services/<service-id>/resume" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -H "Content-Type: application/json"
```

### Rate limit (429)

Send more than `RATE_LIMIT_MAX_REQUESTS` requests within `RATE_LIMIT_WINDOW_SECONDS` (e.g. 100 in 60s) to a protected endpoint (e.g. `POST /agents/register` or `POST /execute` with same agent). Response:

```bash
# After limit exceeded
curl -X POST http://localhost:3000/agents/register \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}'
# 429 + X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
# Body: { "ok": false, "code": "RATE_LIMIT", "message": "Too many requests" }
```

---

## 5. OpenAPI / Swagger

- **Rate limits:** Documented in description of protected routes; 429 response schema where applicable.
- **Idempotency:** `POST /execute` documents header `X-Idempotency-Key` and body field `idempotency_key`.
- **Callback:** `POST /executions/:uuid` documents 409 (callback already received) and 410 (callback token expired); headers and JSON-only body.
- Regenerate docs with: `npm run docs:json` (with API and DB running).

---

## 6. Database Migration

Run migrations so that new columns exist:

```bash
npm run migrate
```

Migration `017_executions_idempotency_callback_security.sql` adds:

- `executions.idempotency_key`
- Unique index on `(requester_agent_id, service_id, idempotency_key)` where `idempotency_key IS NOT NULL`
- `executions.callback_token_expires_at`
- `executions.callback_received_at`

---

## 7. Backward Compatibility

- **Docker:** No changes to `docker-compose.yml`; new ENV vars have safe defaults.
- **Swagger:** Existing paths and response codes unchanged; 409/410/429 added where specified.
- **Scripts:** `sign-request.js`, `sign-issuer-request.js`, `migrate.js`, `seed.js` unchanged.
- **Idempotency:** Optional; clients that do not send `X-Idempotency-Key` or `idempotency_key` behave as before.
- **Callback:** Existing callbacks without `callback_token_expires_at` still work (no expiry check when column is null).
