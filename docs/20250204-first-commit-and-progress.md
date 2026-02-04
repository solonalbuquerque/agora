# First Commit and Current Progress

**Date:** 2025-02-04

This document records what was delivered in the initial (first) commit and the current state of the AGORA project at this milestone.

---

## 1. What the first commit included

The **first commit** established the full open-core codebase for AGORA (Agent Grid Open Runtime Architecture). All of the following were added in that commit:

### 1.1 Core application

- **API:** Fastify app (`src/app.js`), server entry (`src/server.js`), config (`src/config.js`).
- **Auth:** HMAC-SHA256 protocol (`src/lib/auth.js`), canonical payload, timestamp window, signature verification.
- **Support libs:** Errors, responses, IDs (`src/lib/errors.js`, `responses.js`, `ids.js`).

### 1.2 Data layer

- **Database modules:** `src/db/` — agents, wallets, ledger, services, executions, reputation (and index for transactions).
- **Migrations:** SQL migrations under `migrations/` — in the first commit: 001_agents through 005_reputation_views; the repository currently also includes 006–013 (coins, humans, issuers, instance, execution callbacks).

### 1.3 API surface

- **Routes:** Agents (register, me), wallet (balance, transfer), services (CRUD, execute), executions, reputation.
- **OpenAPI:** Swagger config and UI at `/docs`, spec at `/swagger.json`, including HMAC auth panel for testing.

### 1.4 Tooling and ops

- **Scripts:** `migrate.js` (run migrations), `seed.js` (default coin and test agents with balance), `sign-request.js` (generate HMAC headers for manual/Swagger calls).
- **Docker:** `Dockerfile` and `docker-compose.yml` for API, PostgreSQL, and Redis.
- **Config:** `.env.example`, `.gitignore`, `LICENSE` (Apache 2.0).

### 1.5 Extensions (stubs)

- Stubs under `src/extensions/` for future or managed features: payment provider, reputation provider, identity verification. Not used by the core.

### 1.6 Documentation

- **README.md** — project overview, protocol, environment variables, run instructions (local and Docker), example flows, admin/faucet/issuer/human/instance sections.
- **docs/** — initial prompt, project build guide, project status and API.

---

## 2. Current state at this milestone

- **Core:** Implemented and working: pseudonymous agents, HMAC auth, in-core wallet/ledger (default coin AGOTEST), service registry, execution engine, minimal reputation.
- **Self-host:** `docker-compose up` runs API, PostgreSQL, and Redis; compatible with Portainer Stack.
- **Docs:** All project documentation is in English. The README and `docs/` are aligned with the current codebase; the build guide references all migrations (001–013) and the default coin (AGOTEST).
- **Progress record:** This file (`docs/20250204-first-commit-and-progress.md`) records the first-commit scope and the current milestone for future reference.

---

## 3. Summary

The first commit delivered the complete open core: protocol, API, database, migrations, seed, Docker setup, and documentation. The repository is ready for local development, self-hosting, and extension. This document serves as a dated record of that delivery and the current progress state.
