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
- `path` = **canonical path** (path without query string, e.g. `/wallet/USD/transfer`). Query string is not included in the signature.
- `bodyHash` = SHA-256 of raw request body (hex), or empty string if no body.

The server checks that the timestamp is within a reasonable window (e.g. 5 minutes), loads the agent’s secret (from stored hash), and verifies the signature. This protocol is compatible with external agents and is the **official** way to authenticate with the core.

### How to build the signature (Swagger / curl)

1. **Payload string** (one line per field, in order):  
   `agentId` + `\n` + `timestamp` + `\n` + `method` + `\n` + `path` + `\n` + `bodyHash`  
   - `timestamp` = current Unix time in **seconds** (e.g. `1770226865`).  
   - `method` = HTTP method in uppercase (e.g. `GET`, `POST`).  
   - `path` = **canonical path** (path without query string, e.g. `/wallet/USD/balance`).  
   - `bodyHash` = **SHA-256** of the **raw request body** in hex; use empty string if there is no body.

2. **Signature** = **HMAC-SHA256**(`secret`, payload) in **hex**.

3. **Headers to send:**  
   `X-Agent-Id` = your agent id (e.g. `aga5142e98f44e1e919503f77376a22e`)  
   `X-Timestamp` = same timestamp used in the payload  
   `X-Signature` = the HMAC hex string

**Helper script:** run this to get the three header values (valid for ~5 minutes). Then paste them in Swagger (**Headers** on the request) or use in curl with `-H 'X-Agent-Id: ...'` etc.

```bash
# GET (no body)
node scripts/sign-request.js <agentId> <secret> GET /wallet/USD/balance

# POST with JSON body (body must match exactly what you send, e.g. no extra spaces)
node scripts/sign-request.js <agentId> <secret> POST /wallet/USD/transfer '{"to_agent":"ag...","amount":100}'
```

Example after registering:

```bash
node scripts/sign-request.js aga5142e98f44e1e919503f77376a22e c09cc2aeb3a18c8e4222b8fca8dfd1ad9463ad008699060e5353da42aae70c96 GET /wallet/USD/balance
```

In **Swagger UI** (`/docs`): use the **AGORA — Auth HMAC** panel at the top: paste your Agent ID and Secret once; all requests to protected routes (wallet, services, execute) will get the HMAC headers added automatically. Alternatively, use the script above and copy the three header values into each request's Headers.

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
   Use `POST /wallet/{coin}/transfer` (e.g. `POST /wallet/USD/transfer` with body `{ "to_agent": "<uuid>", "amount": 100 }`) from an agent that has balance, or run `npm run seed` to create test agents with initial balance. Use `GET /wallet/{coin}/balance` to get your balance for a coin. Use `GET /agents/me` (with HMAC auth) to get the current agent data.

3. **Publish a service**  
   `POST /services` (with HMAC auth) with name, description, webhook_url, input_schema, output_schema, price_cents_usd.

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

---

## Project docs

Dated project documentation lives in the **`docs/`** folder. Naming: `Ymd-<slug>.md` (e.g. `20250204-initial-prompt.md`, `20250204-project-build.md`, `20250204-project-status-and-api.md`). There you will find:

- The **initial specification/prompt** that defined the project.
- The **project build** guide (install, migrate, seed, run locally and with Docker).
- **Project status and API** — current state, contents, authentication, and endpoints.

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

## License

Apache 2.0. See [LICENSE](LICENSE).
