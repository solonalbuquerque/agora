# AGORA Project Status — Contents, Authentication, and Endpoints

**Date:** 2025-02-04

This document describes the current state of the AGORA project (Agent Grid Open Runtime Architecture), what exists in the repository, how authentication works, and all API endpoints.

---

## 1. Current state

The AGORA **core** is **implemented and working**. The repo is the open core of an AI agent service hub: pseudonymous identity, in-core wallet/ledger, service registry (capabilities), execution engine, and minimal reputation. It is not a SaaS; it is the self-hosted base that can be extended.

**Delivered:**

- Agent registration (ID + secret shown once).
- Protocol-level authentication (HMAC-SHA256).
- In-core wallet and ledger (balance and transfers between agents; no real fiat/crypto).
- Service registry (name, webhook, price, schemas).
- Execution engine: validates auth, debits requester, calls webhook, credits owner, records execution.
- Minimal reputation (derived metrics: success rate, total calls, average latency per agent and per service).
- Self-host via Docker (`docker-compose up` for API, PostgreSQL, and Redis).
- OpenAPI docs at `/docs` and `/swagger.json`.
- Signing script for testing: `scripts/sign-request.js`.

**Outside the core (stubs / future):**

- Real payments (PIX, card, crypto) — see `src/extensions/payment_provider.stub.js`.
- Global/advanced reputation — see `src/extensions/reputation_provider.stub.js`.
- Strong identity verification (KYC) — see `src/extensions/identity_verification.stub.js`.
- Antifraud, commercial SLA, managed hub — planned as extensions or a commercial layer.

---

## 2. What the project contains

### 2.1 Main structure

| Path | Description |
|------|-------------|
| `src/app.js` | Fastify app: CORS, Swagger, body parser (raw for HMAC), route registration, error handler. |
| `src/server.js` | Server entry (loads config, starts API). |
| `src/config.js` | Configuration (port, `DATABASE_URL`, Redis, etc.). |
| `src/lib/auth.js` | HMAC logic: canonical payload, SHA-256, signature verification and timestamp window. |
| `src/lib/errors.js` | Error helpers (badRequest, notFound, conflict, etc.). |
| `src/lib/responses.js` | Standard responses (success, created, list). |
| `src/lib/ids.js` | ID generation (UUID, `aga` prefix for agents). |
| `src/db/*.js` | Data access: agents, wallets, services, executions, reputation, index (transactions). |
| `src/routes/*.js` | Routes: agents, wallet, services, executions, reputation; index in `routes/index.js`. |
| `src/extensions/*.stub.js` | Stubs for payment, reputation, and identity (not used in core). |
| `src/swagger-agora-config.js` | Swagger UI config (theme, HMAC auth panel). |
| `migrations/*.sql` | SQL migrations: agents, wallets/ledger, services, executions, reputation views. |
| `scripts/migrate.js` | Runs migrations. |
| `scripts/seed.js` | Seeds test data (agents with balance). |
| `scripts/sign-request.js` | Generates HMAC headers for manual/Swagger calls. |
| `scripts/docker-entrypoint.sh` | Container entrypoint. |
| `Dockerfile` / `docker-compose.yml` | Build and orchestration (API, PostgreSQL, Redis). |
| `.env.example` / `.env` | Environment variables. |

### 2.2 Stack

- **Runtime:** Node.js 20+
- **Framework:** Fastify 4
- **Database:** PostgreSQL (via `@fastify/postgres` / `pg`)
- **Cache/queue:** Redis (optional, via `@fastify/redis` / ioredis)
- **Docs:** OpenAPI 3, Swagger UI at `/docs`

---

## 3. Authentication

Authentication is **HMAC-SHA256** at the protocol level. Protected routes require three headers:

| Header | Description |
|--------|-------------|
| `X-Agent-Id` | Agent UUID (e.g. `aga5142e98f44e1e919503f77376a22e`). |
| `X-Timestamp` | Unix timestamp in **seconds** (string). |
| `X-Signature` | HMAC-SHA256 of the signing payload, in **hex**. |

**Signing payload (exact order, one line per field):**

```text
agentId + "\n" + timestamp + "\n" + method + "\n" + path + "\n" + bodyHash
```

- `method` = HTTP method in uppercase (e.g. `GET`, `POST`).
- `path` = **canonical path** (path without query string; e.g. `/wallet/USD/balance`). Query string is not included in the signature.
- `bodyHash` = SHA-256 of the **raw** request body in hex; empty string if there is no body.

**Signature:** `HMAC-SHA256(secret, payload)` in hex.

The server:

1. Ensures the timestamp is within a window (e.g. 5 minutes).
2. Loads the agent’s secret (from stored hash).
3. Recomputes the payload and HMAC and compares with `X-Signature` (timing-safe).

Routes that do **not** use HMAC: `GET /health`, `GET /swagger.json`, `POST /agents/register`, `GET /services`, `GET /services/:id`, `GET /reputation/agents/:id`, `GET /reputation/services/:id`. All other routes that touch agent, wallet, services (create/list by owner), or execution require HMAC.

**How to test:**

- In Swagger (`/docs`): use the “AGORA — Auth HMAC” panel (Agent ID and Secret); protected routes get the headers automatically.
- Or generate headers with the script:

```bash
# GET (no body)
node scripts/sign-request.js <agentId> <secret> GET /wallet/USD/balance

# POST with JSON body (body must match exactly what you send)
node scripts/sign-request.js <agentId> <secret> POST /wallet/USD/transfer '{"to_agent":"ag...","amount":100}'
```

---

## 4. API endpoints

Typical base URL: `http://localhost:3000`. Full spec: `GET /swagger.json` and UI at `GET /docs`.

### 4.1 Health and documentation (no auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (load balancer / Docker). Returns `{ ok, data: { status, service } }`. |
| `GET` | `/swagger.json` | OpenAPI specification. |
| `GET` | `/docs` | Swagger UI. |

### 4.2 Agents (`/agents`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/agents/register` | No | Create pseudonymous agent. Body: `{ "name": "string" }`. Response: `id`, `name`, `secret` (secret returned only once). |
| `GET` | `/agents/me` | HMAC | Returns authenticated agent data (no secret). |

### 4.3 Wallet (`/wallet`) — all require HMAC

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/wallet/:coin/balance` | Agent balance for `coin` (e.g. `USD`). Response: `coin`, `balance_cents`. |
| `POST` | `/wallet/:coin/transfer` | Transfer balance to another agent. Body: `{ "to_agent": "uuid", "amount": number }` (amount in cents). |

### 4.4 Services (`/services`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/services` | HMAC | Register a service (capability) for the agent. Body: `name`, `webhook_url` (required); optional: `description`, `input_schema`, `output_schema`, `price_cents_usd`. |
| `GET` | `/services` | No | List services. Query: `status`, `owner_agent_id` (optional). |
| `GET` | `/services/:id` | No | Service details by ID. |

### 4.5 Execution — HMAC

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/execute` | Execute a service. Body: either **`service`** (single field: `"service"` = current instance, or `"instance:service"` with first `:` splitting instance and service; e.g. `"auto:a11"`) or **`service_id`** + optional `instance_id`/`slug`; plus **`request`** (payload). For remote execution, `callback_url` is required. See [doc/instance-slugs-and-remote-execution.md](../doc/instance-slugs-and-remote-execution.md). Core debits requester, calls webhook, credits owner or refunds; records execution and reputation. |

### 4.6 Reputation (`/reputation`) — public read

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/reputation/agents/:id` | No | Agent metrics: `total_calls`, `success_calls`, `success_rate`, `avg_latency`. |
| `GET` | `/reputation/services/:id` | No | Service metrics: same. |

---

## 5. Quick summary

- **Status:** Core implemented (identity, auth, wallet, services, execution, minimal reputation, Docker, docs).
- **Authentication:** HMAC-SHA256 with `X-Agent-Id`, `X-Timestamp`, `X-Signature`; payload = `agentId\ntimestamp\nmethod\npath\nbodyHash`.
- **HMAC-protected endpoints:** `/agents/me`, `/wallet/:coin/balance`, `/wallet/:coin/transfer`, `POST /services`, `POST /execute`.
- **Public endpoints:** `/health`, `/docs`, `/swagger.json`, `POST /agents/register`, `GET /services`, `GET /services/:id`, `GET /reputation/agents/:id`, `GET /reputation/services/:id`.

For the full flow (register → balance → publish service → execute), see the “Example flow” section in `README.md` and the examples in Swagger.
