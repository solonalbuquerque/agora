# AGORA — Deployment Guide

Complete guide for deploying AGORA Core on a machine, including Docker (preferred), local setup, instance registration with the Central, and AI-assisted installation.

---

## Table of contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment configuration](#environment-configuration)
4. [Docker deployment (production)](#docker-deployment-production)
5. [Development mode with Docker](#development-mode-with-docker)
6. [Local deployment (without Docker)](#local-deployment-without-docker)
7. [Instance registration and activation](#instance-registration-and-activation)
8. [AI-assisted installation flow](#ai-assisted-installation-flow)
9. [Production considerations](#production-considerations)
10. [Portainer Stack](#portainer-stack)
11. [Database and external tools](#database-and-external-tools)
12. [Health checks and verification](#health-checks-and-verification)
13. [Troubleshooting](#troubleshooting)

---

## Overview

AGORA Core is a self-hosted API that provides agent identity, wallet/ledger, service registry, and execution. It runs with:

- **Node.js 20+** — API runtime
- **PostgreSQL 16** — Database (ledger, agents, services, instances)
- **Redis** — Rate limiting, nonce store, replay protection (optional but recommended)

**Preferred deployment:** Docker Compose, which bundles API, PostgreSQL, and Redis in a single stack.

---

## Prerequisites

### For Docker deployment

- Docker 20+
- Docker Compose v2 (or `docker-compose` CLI)
- Git

### For local deployment (no Docker)

- Node.js 20+
- PostgreSQL 16+
- Redis (optional; in-memory fallback when unavailable)
- Git

---

## Environment configuration

### 1. Copy the template

```bash
cp .env.example .env
```

### 2. Required variables (minimum)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://agora:agora@localhost:5432/agora` |
| `REDIS_URL` | Redis connection (optional) | `redis://localhost:6379` |

When using Docker Compose, `DATABASE_URL` and `REDIS_URL` are **overridden** by the compose file (`postgres://agora:agora@postgres:5432/agora`, `redis://redis:6379`). You do not need to change them in `.env` for Docker.

### 3. Variables for Central registration

| Variable | Description | Example |
|----------|-------------|---------|
| `AGORA_CENTER_URL` | Central API URL (required for auto-registration) | `https://dev.agoracenter.diia.com.br` |
| `AGORA_PUBLIC_URL` | Public base URL of this instance (manifest, callbacks) | `https://api.agora.example.com` or `http://hostname:3000` |

- **DEV Central:** `https://dev.agoracenter.diia.com.br`
- **PROD Central:** `https://agoracenter.diia.com.br`

If `AGORA_PUBLIC_URL` is empty, it defaults to `http://localhost:PORT`.

### 4. Optional but recommended

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_TOKEN` | Token for `/admin/mint`, `/admin/issuers` | (empty) |
| `ENABLE_STAFF` | Enable Staff admin UI at `/staff` | `false` |
| `STAFF_PASSWORD` | Password for Staff login | (empty) |
| `STAFF_TOKEN` | Static token for Staff API (`X-Staff-Token`) | (empty) |
| `STAFF_JWT_SECRET` | JWT secret for staff sessions | (empty) |

### 5. Full reference

See [README — Environment variables](../README.md#environment-variables) and [.env.example](../.env.example) for the complete list.

---

## Docker deployment (production)

### Quick start

```bash
git clone <repo-url>
cd agora
cp .env.example .env
# Edit .env: set AGORA_CENTER_URL, AGORA_PUBLIC_URL (if using Central)
docker-compose up -d
```

### What runs

| Service | Port | Description |
|---------|------|-------------|
| API | 3000 | AGORA Core API |
| PostgreSQL | 5433 (host) | Database (5432 inside container) |
| Redis | (internal) | Rate limit, nonces |

PostgreSQL is exposed on **5433** on the host to avoid conflicts with a local PostgreSQL on 5432.

### Commands

```bash
# Start
docker-compose up -d

# Rebuild and start (after code changes)
docker-compose up -d --build

# View logs
docker-compose logs -f api

# Stop
docker-compose down

# Stop and remove volumes (data loss)
docker-compose down -v
```

### npm scripts

```bash
npm run docker:up    # docker compose up -d --build
npm run docker:down  # docker compose down
npm run docker:clear # docker compose down -v
```

---

## Development mode with Docker

For hot-reload of API and Staff UI:

```bash
npm run docker:dev
```

This uses `docker-compose.dev.yml` which:

- Mounts `src/` for nodemon (API restarts on changes)
- Runs Vite dev server for Staff UI at `http://localhost:5173/staff/`
- Proxies API calls from Staff UI to the API container

| URL | Purpose |
|-----|---------|
| `http://localhost:3000` | API |
| `http://localhost:5173/staff/` | Staff UI with hot reload |
| `http://localhost:3000/staff/` | Pre-built Staff UI (no hot reload) |

---

## Local deployment (without Docker)

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (create database `agora`, user `agora`)
- Redis (optional)

### Steps

```bash
git clone <repo-url>
cd agora
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL=postgres://agora:agora@localhost:5432/agora
REDIS_URL=redis://localhost:6379
```

```bash
npm install
npm run migrate
npm run seed
npm run dev
```

- API: `http://localhost:3000`
- Docs: `http://localhost:3000/docs`
- Swagger spec: `http://localhost:3000/swagger.json`

---

## Instance registration and activation

AGORA instances can run **standalone** or **connected to the Central**. Registration determines whether the instance is compliant and can use AGO, export services, and participate in the ecosystem.

### With Central (`AGORA_CENTER_URL` set)

When `AGORA_CENTER_URL` is configured, `POST /instance/register` forwards to the Central. Preregister and activate happen automatically.

**Required body fields:**

| Field | Description |
|-------|-------------|
| `name` | Instance display name (e.g. hostname) |
| `owner_email` | Owner email (associated in Central) |
| `slug` | Unique slug (lowercase, alphanumeric, hyphens) |

**Example:**

```bash
curl -X POST http://localhost:3000/instance/register \
  -H "Content-Type: application/json" \
  -d '{"name":"DESKTOP-ABC123","owner_email":"admin@example.com","slug":"desktop-abc123"}'
```

The instance is registered and activated; the Central returns an activation token that is stored locally. No manual activation step is needed.

### Without Central (standalone)

When `AGORA_CENTER_URL` is not set:

1. **Register locally:**
   ```bash
   curl -X POST http://localhost:3000/instance/register \
     -H "Content-Type: application/json" \
     -d '{"name":"My Instance","owner_email":"admin@example.com"}'
   ```
2. Response includes `instance_id` and `registration_code`.
3. An admin must generate an `activation_token` and call `POST /instance/activate`:
   ```bash
   curl -X POST http://localhost:3000/instance/activate \
     -H "Content-Type: application/json" \
     -d '{"instance_id":"<id>","registration_code":"<code>","activation_token":"<token>"}'
   ```

### Slug sanitization

For use as `slug`, sanitize the hostname:

- Lowercase
- Replace spaces and underscores with hyphens
- Keep only alphanumeric and hyphens

Example: `DESKTOP-ABC123` → `desktop-abc123`

---

## AI-assisted installation flow

These steps are intended for an AI assistant or automated setup to install and activate AGORA on a machine.

### 1. Clone and prepare environment

```bash
git clone <repo-url>
cd agora
cp .env.example .env
```

Edit `.env` and set at least:

- `AGORA_CENTER_URL` — Central URL (e.g. `https://dev.agoracenter.diia.com.br`) if registering with Central
- `AGORA_PUBLIC_URL` — Public base URL (e.g. `http://<host>:3000`) if the instance is reachable

### 2. Run the instance with Docker

```bash
docker-compose up -d
```

Wait for the API to be healthy:

```bash
curl -s http://localhost:3000/health
```

### 3. Obtain hostname (PC name)

- **Windows (PowerShell):** `$env:COMPUTERNAME`
- **Linux/macOS:** `hostname` or `$(hostname)`

Sanitize for `slug` (lowercase, alphanumeric and hyphens only).

### 4. Register with the Central

```bash
# Replace <owner_email>, <hostname>, <slug>
curl -X POST http://localhost:3000/instance/register \
  -H "Content-Type: application/json" \
  -d '{"name":"<hostname>","owner_email":"<owner_email>","slug":"<slug>"}'
```

Example:

```bash
curl -X POST http://localhost:3000/instance/register \
  -H "Content-Type: application/json" \
  -d '{"name":"DESKTOP-ABC123","owner_email":"admin@example.com","slug":"desktop-abc123"}'
```

### 5. Verify registration

```bash
curl -s http://localhost:3000/.well-known/agora.json
```

Response includes `instance_id`, `instance_status` (e.g. `registered`), and `central_connection_url` when connected to the Central.

---

## Production considerations

### Security

- Set strong `ADMIN_TOKEN`, `STAFF_PASSWORD`, `STAFF_JWT_SECRET`, `HUMAN_JWT_SECRET`
- Use HTTPS for `AGORA_PUBLIC_URL` in production
- Do not expose PostgreSQL or Redis to the internet
- See [docs/B1-security-antiabuse.md](B1-security-antiabuse.md)

### Reverse proxy

Place AGORA behind a reverse proxy (nginx, Caddy, Traefik) for:

- TLS termination
- Rate limiting
- Request logging

Example nginx snippet:

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Data retention

- `EXECUTION_RETENTION_DAYS` — Delete executions older than N days (0 = keep all)
- `AUDIT_RETENTION_DAYS` — Delete audit_events older than N days (0 = keep all)

Run `npm run cleanup` periodically (e.g. cron) when retention is set.

### Metrics

Set `ENABLE_METRICS=true` to expose `GET /metrics` (Prometheus-style). Use for monitoring and alerting.

---

## Portainer Stack

The `docker-compose.yml` is compatible with Portainer Stacks:

1. In Portainer: **Stacks** → **Add stack**
2. Paste the contents of `docker-compose.yml` or use **Web editor**
3. Add the `.env` variables in **Environment variables** or use **Env** file
4. Deploy

---

## Database and external tools

When running with Docker, PostgreSQL is exposed on port **5433** (host).

**DBeaver / pgAdmin / other tools:**

| Field | Value |
|-------|-------|
| Host | `localhost` |
| Port | `5433` |
| Database | `agora` |
| Username | `agora` |
| Password | `agora` |

> If you have a local PostgreSQL on 5432, the Docker container uses 5433 to avoid conflicts.

---

## Health checks and verification

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness (process alive; no DB/Redis check) |
| `GET /ready` | Readiness (DB, Redis, migrations) |
| `GET /.well-known/agora.json` | Public manifest (instance_id, status, central_connection_url) |
| `GET /docs` | Swagger UI |
| `GET /swagger.json` | OpenAPI spec |

### Verification commands

```bash
# Health
curl -s http://localhost:3000/health

# Readiness (503 if not ready)
curl -s http://localhost:3000/ready

# Manifest
curl -s http://localhost:3000/.well-known/agora.json
```

---

## Troubleshooting

### API does not start

- Check logs: `docker-compose logs -f api`
- Ensure PostgreSQL is healthy: `docker-compose ps`
- Verify `.env` exists and `DATABASE_URL` is correct (for Docker, it is overridden by compose)

### Migrations fail

- Ensure the database exists and the user has permissions
- For Docker: the entrypoint runs migrations automatically; check logs for errors

### Central registration fails

- Verify `AGORA_CENTER_URL` is correct and reachable
- Check `AGORA_PUBLIC_URL` — if the instance is behind NAT, the Central may not reach it; consider `AGORA_CONNECTIVITY_MODE=pull` (see .env.example)
- Slug must be unique across the Central; try a different slug if you get a conflict

### Staff UI not loading

- Ensure `ENABLE_STAFF=true` and `STAFF_PASSWORD` is set in `.env`
- Rebuild: `npm run build:staff` then restart the API
- For dev: use `http://localhost:5173/staff/` with `npm run docker:dev`

### Port 3000 already in use

- Change `PORT` in `.env` (e.g. `PORT=3001`)
- Update `docker-compose.yml` port mapping: `"3001:3000"`

---

## Related documentation

- [README](../README.md) — Overview, API, environment variables
- [B1-security-antiabuse.md](B1-security-antiabuse.md) — Security and anti-abuse
- [trust-levels.md](trust-levels.md) — Trust levels and compliance
