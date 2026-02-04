# Initial specification (source of truth)

This document preserves the initial specification used to define the AGORA Core repository. It is the reference for scope, philosophy, and structure.

---

## Project name and role

**AGORA: Agent Grid Open Runtime Architecture** — AI Service Hub Core.

This repository is:

- The **CORE ENGINE**
- The **PROTOCOL**
- The **BASE SELF-HOSTED** layer

It is **not** a SaaS. It is the open nucleus of a larger ecosystem.

---

## Philosophy

- **Open source** to: create a standard, gain adoption, build trust.
- **Simple but correct** — no over-engineering.
- **Extensible by design** — hooks and interfaces for future features.
- **Secure enough for initial production** — HMAC auth, no secrets in logs.
- **No dependency on proprietary services** — self-host with PostgreSQL and optional Redis.

---

## What this core includes

- Basic pseudonymous agent identity.
- HMAC protocol-level authentication.
- Simple wallet with ledger.
- Basic transfers between agents.
- Service registry (capabilities).
- Synchronous execution via webhook.
- Minimal logs and reputation.
- Self-host via Docker.

---

## What this core does NOT include (but must anticipate)

- Real payments (PIX, card, crypto).
- Advanced global reputation.
- Sophisticated antifraud.
- KYC / strong verification.
- Commercial SLA.
- Custody of funds.

These must appear as: **interfaces**, **abstractions**, **documented TODOs**, **code stubs**, and **“Future / Pro”** sections in the README.

---

## Mandatory stack

- **Node.js** (plain JavaScript).
- **Fastify**.
- **PostgreSQL**.
- **Redis** (optional but recommended).
- **Docker** + **docker-compose**.
- **OpenAPI** with `/docs` and `/swagger.json`.

---

## Core modules (summary)

1. **Agent identity** — table `agents`; `POST /agents/register`; HMAC auth with headers `X-Agent-Id`, `X-Timestamp`, `X-Signature`.
2. **Wallet + ledger** — `wallets_coins`, `wallets`, `ledger_entries`; `POST /wallet/transfer`.
3. **Service registry** — table `services`; `POST /services`, `GET /services`.
4. **Execution engine** — table `executions`; flow: validate auth → validate balance → debit → call webhook → credit owner → record execution; use Postgres transactions.
5. **Minimal reputation** — derived (success_rate, total_calls, avg_latency); `GET /reputation/agents/:id`, `GET /reputation/services/:id`.
6. **Mock services** — e.g. `POST /mock/echo`, `POST /mock/delay`.
7. **Extensions** — folder `src/extensions` with stubs: payment_provider, reputation_provider, identity_verification.
8. **Self-host** — Dockerfile (Node LTS, non-root, healthcheck), docker-compose (api, postgres, redis, volumes), .env.example.
9. **Documentation** — README with what is open vs not, protocol description, local/self-host run, example flow, Future/Managed Services; `/docs` folder with dated docs (Ymd-slug.md), including this initial prompt and the project build guide.
10. **Quality** — readable code, no secrets in logs, standardized responses, everything runs with `docker-compose up`.

---

## ID conventions

- **Agents:** UUID with prefix `ag` (e.g. generate UUID then force first two characters to `ag`).
- **Services:** UUID with prefix `ser`.

---

## Folder structure (target)

- `/src` — app.js, server.js, config.js, routes/, db/, lib/, extensions/
- `/migrations` — SQL migrations (001–005)
- `/scripts` — seed.js, migrate.js
- `/docs` — dated documents (Ymd-slug.md)
- Root: Dockerfile, docker-compose.yml, .env.example, README.md, LICENSE (Apache 2.0), package.json

All code, comments, and user-facing text in **English**.
