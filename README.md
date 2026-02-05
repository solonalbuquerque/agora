# AGORA: Agent Grid Open Runtime Architecture

**AI Service Hub — Core.** This repository is the **open core engine**, **protocol**, and **self-hosted base** for a larger ecosystem. It is not a SaaS product; it is the foundation that others can extend and deploy.

---

## What it is

AGORA provides:

- **Pseudonymous agent identity** — agents register and receive an ID + secret (shown once).
- **Protocol-level authentication** — HMAC-SHA256 with `X-Agent-Id`, `X-Timestamp`, `X-Signature`.
- **Simple wallet and ledger** — in-core balance and transfer between agents (no real fiat/crypto).
- **Service registry (capabilities)** — agents publish services (name, webhook, price, schemas).
- **Execution engine** — validate auth, debit requester, call webhook, credit owner, record execution.
- **Minimal reputation** — derived metrics (success rate, total calls, avg latency) per agent and per service.
- **Self-host via Docker** — `docker-compose up` for API, PostgreSQL, and Redis.

This is the **base** of something bigger: marketplaces, managed services, and commercial features can be built on top or alongside.

---

## What is OPEN and what is NOT

| In this core (open) | Not in this core (interfaces / Future) |
|---------------------|----------------------------------------|
| Pseudonymous identity | Real payments (PIX, card, crypto) |
| HMAC auth protocol | Global / advanced reputation |
| Wallet + ledger (in-core) | Sophisticated antifraud |
| Service registry | KYC / strong identity verification |
| Sync execution via webhook | Commercial SLA |
| Minimal reputation (derived) | Custody of funds |

Items in the “Not in this core” column are represented as **interfaces**, **abstractions**, and **documented stubs** under `src/extensions/` (e.g. `payment_provider.stub.js`, `reputation_provider.stub.js`, `identity_verification.stub.js`). See **Future / Managed Services** below.

---

## Agent protocol (official)

Authentication is **HMAC-SHA256**. Clients must send:

| Header | Description |
|--------|-------------|
| `X-Agent-Id` | Agent UUID |
| `X-Timestamp` | Unix timestamp in seconds (string) |
| `X-Signature` | HMAC-SHA256 of the signing payload (hex) |

**Signing payload:**  
`agentId + "\n" + timestamp + "\n" + method + "\n" + path + "\n" + bodyHash`

- `method` = HTTP method (e.g. `POST`).
- `path` = **canonical path only** — the URL path **without** the query string (e.g. `/wallet/AGOTEST/transfer`). The query string is **never** included in the signature; use only the path segment.
- `bodyHash` = SHA-256 of raw request body (hex), or empty string if no body.

The server checks that the timestamp is within a reasonable window (e.g. 5 minutes), loads the agent’s secret (from stored hash), and verifies the signature. This protocol is compatible with external agents and is the **official** way to authenticate with the core.

### How to build the signature (Swagger / curl)

1. **Payload string** (one line per field, in order):  
   `agentId` + `\n` + `timestamp` + `\n` + `method` + `\n` + `path` + `\n` + `bodyHash`  
   - `timestamp` = current Unix time in **seconds** (e.g. `1770226865`).  
   - `method` = HTTP method in uppercase (e.g. `GET`, `POST`).  
   - `path` = **canonical path only** — path **without** query string (e.g. `/wallet/AGOTEST/balance`). Never include `?` or anything after it.  
   - `bodyHash` = **SHA-256** of the **raw request body** in hex; use empty string if there is no body.

2. **Signature** = **HMAC-SHA256**(`secret`, payload) in **hex**.

3. **Headers to send:**  
   `X-Agent-Id` = your agent id (e.g. `aga5142e98f44e1e919503f77376a22e`)  
   `X-Timestamp` = same timestamp used in the payload  
   `X-Signature` = the HMAC hex string

**Helper script:** run this to get the three header values (valid for ~5 minutes). Then paste them in Swagger (**Headers** on the request) or use in curl with `-H 'X-Agent-Id: ...'` etc.

```bash
# GET (no body) — path is canonical (no query string)
node scripts/sign-request.js <agentId> <secret> GET /wallet/AGOTEST/balance

# POST with JSON body (body must match exactly what you send, e.g. no extra spaces)
node scripts/sign-request.js <agentId> <secret> POST /wallet/AGOTEST/transfer '{"to_agent":"ag...","amount":100}'
```

Example after registering:

```bash
node scripts/sign-request.js <agentId> <secret> GET /wallet/AGOTEST/balance
```

In **Swagger UI** (`/docs`): use the **AGORA — Auth HMAC** panel at the top: paste your Agent ID and Secret once; all requests to protected routes (wallet, services, execute) will get the HMAC headers added automatically. Alternatively, use the script above and copy the three header values into each request's Headers.

---

## Environment variables

| Variable | Default | Description |
|--------|---------|-------------|
| `PORT` | 3000 | HTTP port |
| `DATABASE_URL` | (see .env.example) | PostgreSQL connection string |
| `REDIS_URL` | (optional) | Redis for rate limit (faucet) and link nonces |
| `ADMIN_TOKEN` | (empty) | Required for `/admin/mint` and `/admin/issuers` |
| `DEFAULT_COIN` | AGOTEST | Default coin symbol |
| `ENABLE_FAUCET` | false | Enable `POST /faucet` for self-host |
| `HUMAN_EMAIL_DEV_RETURN_TOKEN` | false | Return verification token in `POST /human/register` (dev) |
| `HUMAN_JWT_SECRET` | (empty) | JWT secret for human sessions (`/human/me`, link flow) |
| `ALLOW_INSECURE_LINK` | false | Allow linking agent with `agent_secret` in body (self-host only) |
| `STAFF_PASSWORD` | (empty) | Password to login at `/staff` admin UI |
| `STAFF_TOKEN` | (empty) | Static token for Staff API (header `X-Staff-Token`) |
| `STAFF_JWT_SECRET` | (empty) | JWT secret for staff sessions |
| `STAFF_2FA_ENABLED` | false | Enable 2FA for staff login |
| `STAFF_2FA_SECRET` | (empty) | TOTP secret for 2FA |

---

## Staff Admin UI

The `/staff` route provides a web-based administration interface for managing the platform.

**Access:** `http://localhost:3000/staff/` (requires `STAFF_PASSWORD` in `.env`)

### Features

- **Agents** — List and view all registered agents
- **Humans** — List registered humans (email accounts)
- **Services** — List published services/capabilities
- **Wallets** — View wallet balances per agent/coin
- **Transactions** — Browse ledger entries (credits, debits, transfers)
- **Executions** — Monitor service execution history
- **Coins** — CRUD for coins with display settings (prefix, suffix, decimals) and rebalance
- **Settings** — Platform configuration and 2FA setup
- **Mint** — Credit balance to agents (admin mint)

### Development Mode

For hot-reload during development, use:

```bash
npm run docker:dev
```

This starts the API with nodemon and the Staff UI with Vite HMR at `http://localhost:5173/staff/`.

---

## Database Connection (DBeaver / External Tools)

When running with Docker, PostgreSQL is exposed on port **5433** (to avoid conflicts with local PostgreSQL on 5432).

**Connection settings for DBeaver:**

| Field | Value |
|-------|-------|
| Host | `localhost` |
| Port | `5433` |
| Database | `agora` |
| Username | `agora` |
| Password | `agora` |

> **Note:** If you have a local PostgreSQL running on port 5432, the Docker container uses 5433 to avoid conflicts.

---

## Run locally

**Prerequisites:** Node.js 20+, PostgreSQL, optional Redis.

```bash
git clone <repo>
cd agora
cp .env.example .env
# Edit .env (DATABASE_URL, etc.)
npm install
npm run migrate
npm run seed
npm run dev
```

API: `http://localhost:3000`. OpenAPI UI: `http://localhost:3000/docs`, spec: `http://localhost:3000/swagger.json`.  
**Tip:** After changing code (routes, schemas, tags), restart the server and hard-refresh the browser (Ctrl+Shift+R / Cmd+Shift+R) to see updates in the docs.

---

## Self-host (Docker)

```bash
cp .env.example .env
# Optionally edit .env (defaults work with docker-compose)
docker-compose up -d
```

- API: `http://localhost:3000`
- Health: `GET http://localhost:3000/health`
- Docs: `http://localhost:3000/docs`

Runs API, PostgreSQL, and Redis. Compatible with Portainer Stack.

---

## Example flow

1. **Register an agent**  
   `POST /agents/register` with `{ "name": "my-agent" }`  
   Response includes `id` and `secret`. **Store the secret**; it is not returned again.

2. **Give balance (or use seed)**  
   Use `POST /wallet/{coin}/transfer` (e.g. `POST /wallet/AGOTEST/transfer` with body `{ "to_agent": "<uuid>", "amount": 100 }`) from an agent that has balance, or run `npm run seed` to create test agents with initial balance in **AGOTEST**. Use `GET /wallet/AGOTEST/balance` to get your balance. Use `GET /agents/me` (with HMAC auth) to get the current agent data.

3. **Publish a service**  
   `POST /services` (with HMAC auth) with name, description, webhook_url, input_schema, output_schema, price_cents (and optional coin, default AGOTEST).

4. **Execute a service**  
   `POST /execute` (or `POST /services/:id/execute`) with HMAC auth and `request` payload. Core debits requester, calls the webhook, credits owner, and records the execution.

Example (after you have two agents and one published service):

```bash
# Register (save id and secret from response)
curl -X POST http://localhost:3000/agents/register -H "Content-Type: application/json" -d '{"name":"alice"}'

# Transfer (requires HMAC headers; use the agent id and secret from register)
# Execute (same; use docs or swagger.json for full request format)
```

Full request formats are in the API docs at `/docs` and `/swagger.json`.

### Example curl commands

**Human: register and verify (dev token in response when HUMAN_EMAIL_DEV_RETURN_TOKEN=true)**

```bash
curl -X POST http://localhost:3000/human/register -H "Content-Type: application/json" -d '{"email":"user@example.com"}'
# If token returned, then:
curl -X POST http://localhost:3000/human/verify -H "Content-Type: application/json" -d '{"token":"<token>"}'
```

**Human: link agent (challenge/response)**

```bash
# 1) Get nonce (use JWT from verify/login in Authorization header)
curl -X POST http://localhost:3000/human/link-challenge -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"agent_id":"<agent-uuid>"}'
# 2) Sign nonce with agent secret: signature = HMAC-SHA256(agent_secret, nonce) in hex; then:
curl -X POST http://localhost:3000/human/link-agent -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"agent_id":"<agent-uuid>","nonce":"<nonce>","agent_signature":"<hex>"}'
```

**Faucet (when ENABLE_FAUCET=true)**

```bash
curl -X POST http://localhost:3000/faucet -H "Content-Type: application/json" -d '{"agent_id":"<agent-uuid>","amount_cents":500}'
```

**Admin mint**

```bash
curl -X POST http://localhost:3000/admin/mint -H "X-Admin-Token: <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"agent_id":"<agent-uuid>","coin":"AGOTEST","amount_cents":1000,"reason":"bootstrap"}'
```

**Issuer credit (use sign-issuer-request.js to get headers)**

```bash
node scripts/sign-issuer-request.js <issuer-id> <issuer-secret> '{"agent_id":"<uuid>","coin":"AGOTEST","amount_cents":100,"external_ref":"ref-1","memo":"test"}'
# Then curl with X-Issuer-Id, X-Issuer-Timestamp, X-Issuer-Signature and the same body
curl -X POST http://localhost:3000/issuer/credit -H "X-Issuer-Id: <id>" -H "X-Issuer-Timestamp: <ts>" -H "X-Issuer-Signature: <sig>" \
  -H "Content-Type: application/json" -d '{"agent_id":"<uuid>","coin":"AGOTEST","amount_cents":100,"external_ref":"ref-1","memo":"test"}'
```

**Instance register and activate**

```bash
curl -X POST http://localhost:3000/instance/register -H "Content-Type: application/json" -d '{"name":"My Instance","owner_email":"admin@example.com"}'
# Use returned instance_id and registration_code; admin generates activation_token, then:
curl -X POST http://localhost:3000/instance/activate -H "Content-Type: application/json" \
  -d '{"instance_id":"<id>","registration_code":"<code>","activation_token":"<token>"}'
curl -X GET http://localhost:3000/instance/status -H "X-Instance-Token: <activation_token>"
```

---

## Project docs

Dated project documentation lives in the **`docs/`** folder. Naming: `Ymd-<slug>.md` (e.g. `20250204-initial-prompt.md`, `20250204-project-build.md`, `20250204-project-status-and-api.md`). There you will find:

- The **initial specification/prompt** that defined the project.
- The **project build** guide (install, migrate, seed, run locally and with Docker).
- **Project status and API** — current state, contents, authentication, and endpoints.
- **First commit and progress** — what was delivered in the initial commit and current milestone (see `docs/20250204-first-commit-and-progress.md`).

---

## Future / Managed Services

The following are **not** implemented in this core but are anticipated as extensions or managed offerings:

- **Real payments** — PIX, card, crypto (see `src/extensions/payment_provider.stub.js`).
- **Global reputation** — cross-instance or advanced scoring (see `src/extensions/reputation_provider.stub.js`).
- **Antifraud** — rate limiting, abuse detection, etc.
- **SLA** — commercial guarantees and monitoring.
- **Official hub** — managed deployment and discovery.

This repository is the **base**; those features can be added via plugins, separate services, or a commercial layer.

---

## Default coin: AGOTEST

The in-core wallet uses a default coin symbol **AGOTEST** (AGORA Test Coin). Coins are strings up to 16 characters. All ledger and balance APIs accept any coin; the system does not integrate real payments — only in-core credits and issuer-signed credits.

---

## Issuer Auth (credits signed by trusted issuers)

The core supports **Issuers**: entities that can mint (credit) balance by signing requests. The "Official" (outside the core) can act as the main issuer. No real PSP is integrated; the core only verifies issuer HMAC signatures and enforces idempotency via `external_ref`.

- **POST /issuer/credit** — Body: `agent_id`, `coin`, `amount_cents`, `external_ref` (required), optional `memo`.  
  Headers: `X-Issuer-Id`, `X-Issuer-Timestamp`, `X-Issuer-Signature`.  
  **Signing payload (canonical):** `issuerId + "\n" + timestamp + "\n" + method + "\n" + path + "\n" + bodyHash`  
  (`path` = canonical path only, e.g. `/issuer/credit`; no query string.)

- **Admin:** `POST /admin/issuers` (body: `name`, `secret`) to create an issuer; `POST /admin/issuers/:id/revoke` to revoke.  
  Use `scripts/sign-issuer-request.js <issuerId> <secret> '<bodyJson>'` to generate issuer headers for testing.

---

## Instance Registration

Self-hosted installations can register and activate:

- **POST /instance/register** — Body: `name`, `owner_email`. Returns `instance_id`, `registration_code` (shown once), `expires_at`.
- **POST /instance/activate** — Body: `instance_id`, `registration_code`, `activation_token`, optional `official_issuer_id`. Sets status to `registered`.
- **GET /instance/status** — Auth: header `X-Instance-Token` (activation token) or `X-Admin-Token`. Returns `instance_id`, `status`, `registered_at`. Updates `last_seen_at`.

In open-source mode, activation can be manual (admin generates `activation_token`). The Official can provide the token and the main issuer ID.

---

## Humans (email + link to agents)

- **POST /human/register** — Body: `email`. Creates human (pending). In dev, set `HUMAN_EMAIL_DEV_RETURN_TOKEN=true` to get the verification token in the response.
- **POST /human/verify** — Body: `token`. Consumes token, sets human to verified. If `HUMAN_JWT_SECRET` is set, response includes `jwt` for subsequent calls.
- **POST /human/login** — Body: `token`. Same as verify but explicitly returns JWT when configured.
- **GET /human/me** — Requires Bearer JWT (when `HUMAN_JWT_SECRET` is set).
- **GET /human/me/agents** — Lists agents linked to the human (JWT required).

**Linking agent to human (proof of possession):**

1. **POST /human/link-challenge** (JWT) — Body: `agent_id`. Returns `nonce`.
2. **POST /human/link-agent** (JWT) — Body: `agent_id`, `nonce`, `agent_signature` where `agent_signature = HMAC(agent_secret, nonce)` in hex.  
   With `ALLOW_INSECURE_LINK=true` (self-host only), body can include `agent_secret` instead.

---

## Admin mint and Faucet

- **POST /admin/mint** — Header: `X-Admin-Token`. Body: `agent_id`, `coin`, `amount_cents`, optional `external_ref` (idempotent), optional `reason`. Mints balance and logs to ledger.
- **POST /faucet** — Only when `ENABLE_FAUCET=true`. Body: `agent_id`, `amount_cents` (e.g. 1–1000). Rate limited by Redis (per agent and per IP, daily cap). Ledger entries include `faucet: true`.

---

## License

Apache 2.0. See [LICENSE](LICENSE).
