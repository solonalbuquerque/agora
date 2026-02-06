# Staff Panel B1/B2 Screens — Specification & Implementation

This document describes the Staff UI extensions for **B1 (Security & Anti-Abuse)** and **B2 (Observability, Audit & Operability)**.

---

## 1. Updated Sidebar Navigation Structure

```
Agents
  └── List Agents

Humans
  └── List Humans

Services
  └── List Services
  └── Executions
  └── Webhook Security      [NEW]
  └── Circuit Breakers      [NEW]

Financial
  └── Balances
  └── Transactions
  └── Coins

Trust
  └── Trust Levels

Executions
  └── Callbacks            [NEW]

System
  └── Dashboard
  └── Security Overview    [NEW]
  └── Rate Limits          [NEW]
  └── Requests             [NEW]
  └── Audit Log            [NEW]
  └── Metrics              [NEW]
  └── Data Retention       [NEW]
  └── Statistics
  └── Settings
```

---

## 2. Screen List with Routes

| Screen | Route | Section |
|--------|-------|---------|
| Security Overview | `/staff/security` | System |
| Rate Limits | `/staff/rate-limits` | System |
| Webhook Security | `/staff/webhook-security` | Services |
| Circuit Breakers | `/staff/circuit-breakers` | Services |
| Callback Security | `/staff/callbacks` | Executions |
| Requests & Tracing | `/staff/requests` | System |
| Audit Log | `/staff/audit` | System |
| Metrics Dashboard | `/staff/metrics` | System |
| Data Retention | `/staff/data-retention` | System |
| Health & Readiness | Extended in `/staff/config` | System → Settings |

---

## 3. Component Hierarchy per Screen

### Security Overview
- `SecurityOverview` (page)
  - `PageHeader`
  - `SecurityWidget` (x6) — count, % change, link

### Rate Limits
- `RateLimits` (page)
  - `PageHeader`
  - Filters card (Scope, Endpoint, Status, Search)
  - Table (columns below)
  - Pagination

### Webhook Security
- `WebhookSecurity` (page)
  - `PageHeader`
  - Filters card
  - Table
  - `SlideModal` (Webhook error history)

### Circuit Breakers
- `CircuitBreakers` (page)
  - `PageHeader`
  - Table

### Callbacks
- `Callbacks` (page)
  - `PageHeader`
  - Filters card
  - Table
  - Pagination

### Requests & Tracing
- `Requests` (page)
  - `PageHeader`
  - Filters card
  - Table
  - `SlideModal` (Request timeline)

### Audit Log
- `AuditLog` (page)
  - `PageHeader`
  - Filters card
  - Table
  - `SlideModal` (Event metadata)

### Metrics
- `Metrics` (page)
  - `PageHeader`
  - Controls (Time range, Auto-refresh)
  - Card grid (HTTP req/min, Exec success/fail, Webhook latency, Callback rate, Wallet transfers)

### Data Retention
- `DataRetention` (page)
  - `PageHeader`
  - Settings card (Execution retention, Audit retention, Save)
  - Actions card (Preview, Run cleanup)

### Config (extended)
- `Config` (page)
  - `PageHeader`
  - **Health Status** card [NEW] (API, DB, Redis, Migrations, Last check)
  - System card
  - 2FA card
  - Issuers table

---

## 4. Table Schemas (Columns + Filters)

### Rate Limits
| Column | Type | Notes |
|--------|------|-------|
| Scope | string | Agent / Issuer / IP |
| Identifier | string | agent_id, issuer_id, IP |
| Endpoint | string | e.g. POST /execute |
| Requests | number | Current window count |
| Limit | number | Max per window |
| Window (s) | number | Window in seconds |
| Status | enum | OK / Throttled |
| Last hit | datetime | Last request timestamp |
| Actions | — | Reset, Block |

**Filters:** Scope, Endpoint, Status, Time range, Search identifier

### Webhook Security
| Column | Type | Notes |
|--------|------|-------|
| Service ID | uuid | Link to service |
| Service Name | string | |
| Owner Agent | uuid | Link to agent |
| Webhook URL | string | Truncated |
| Status | enum | Active / Paused |
| Failures | number | Consecutive failures |
| Last error | string | Reason |
| Last attempt | datetime | |
| Actions | — | Resume, Pause, History |

**Filters:** Status, Owner Agent, Failure count (min)

### Circuit Breakers
| Column | Type | Notes |
|--------|------|-------|
| Service ID | uuid | Link to service |
| Service Name | string | |
| Breaker State | enum | Closed / Open |
| Failure threshold | number | |
| Failures counted | number | |
| Opened at | datetime | |
| Last success | datetime | |
| Actions | — | Force close, Pause service |

### Callbacks
| Column | Type | Notes |
|--------|------|-------|
| Execution ID | uuid | Link to execution |
| Service | string | Service name |
| Status | enum | success / failed / awaiting_callback |
| Token status | enum | Valid / Used / Expired |
| Callback received at | datetime | |
| Rejected reason | string | If any |

**Filters:** Status, Token status, Time range, Search execution

### Requests & Tracing
| Column | Type | Notes |
|--------|------|-------|
| Request ID | string | |
| Method | string | GET, POST, etc. |
| Path | string | |
| Status | number | HTTP status |
| Duration (ms) | number | |
| Agent ID | uuid | Optional |
| Issuer ID | uuid | Optional |
| Instance ID | string | |
| Timestamp | datetime | |
| Actions | — | View timeline |

**Filters:** Method, Status, Path, Agent/Issuer, Time range, Search request ID

### Audit Log
| Column | Type | Notes |
|--------|------|-------|
| Event type | string | ADMIN_MINT, ISSUER_CREDIT, AGENT_BAN, etc. |
| Actor type | string | Admin / Human / Issuer / System |
| Actor ID | string | |
| Target type | string | |
| Target ID | string | |
| Request ID | string | |
| Created at | datetime | |
| Details | — | Opens modal with JSON metadata |

**Filters:** Event type, Actor type, Target type, Date range

---

## 5. Extensions to Existing Tables

### Agents (new columns)
| Column | Type | Notes |
|--------|------|-------|
| Rate-limited | Yes/No | |
| Failed auth (24h) | number | |

### Services (new columns)
| Column | Type | Notes |
|--------|------|-------|
| Circuit breaker | string | State or "-" |
| Webhook health | string | Status or "-" |

### Executions (new columns)
| Column | Type | Notes |
|--------|------|-------|
| Idempotency key | string | Truncated or "-" |
| Request ID | string | Truncated or "-" |
| Callback status | string | |

### Statistics (new section)
- **Security counters (24h)** — table of metric name → count (e.g. auth_failures, rate_limit_violations, etc.)

---

## 6. Example Mock Data

See `staff-ui/src/data/mockSecurity.js` for full mock structures. Summary:

- **securityOverview:** 6 widgets with count, pct_change, link
- **rateLimits.rows:** Agent/IP/Issuer scope, endpoint, requests, limit, status
- **webhookSecurity.rows:** Service with webhook URL, status, failures, last error
- **circuitBreakers.rows:** Service with breaker_state, failure_threshold, opened_at
- **callbacks.rows:** Execution with callback_token_status, rejected_reason
- **requests.rows:** Request ID, method, path, status, duration_ms
- **auditLog.rows:** Event type, actor, target, metadata
- **metrics:** http_requests_per_minute, execution_success_vs_failure, webhook_latency, callback_success_rate, wallet_transfers_per_coin
- **health:** api_process, database, redis, migrations, last_readiness_check
- **dataRetention:** execution_retention_days, audit_log_retention_days
- **dataRetentionPreview:** executions_to_delete, audit_events_to_delete

---

## 7. Backend Endpoints Each Screen Consumes

| Screen | Endpoint(s) | Notes |
|--------|-------------|-------|
| Security Overview | `GET /staff/api/security/overview` | Not implemented; uses mock |
| Rate Limits | `GET /staff/api/security/rate-limits?scope=&endpoint=&status=&q=` | Not implemented; uses mock |
| Rate Limits | `POST /staff/api/security/rate-limits/reset` | Reset counters |
| Rate Limits | `POST /staff/api/security/rate-limits/block` | Block identifier |
| Webhook Security | `GET /staff/api/services/webhook-security?status=&owner_agent_id=&failure_count=` | Not implemented; uses mock |
| Webhook Security | `POST /staff/api/services/:id/resume` | Uses existing admin resume |
| Webhook Security | `POST /staff/api/services/:id/pause` | Not implemented |
| Circuit Breakers | `GET /staff/api/services/circuit-breakers` | Not implemented; uses mock |
| Circuit Breakers | `POST /staff/api/services/:id/circuit-breaker/close` | Force close |
| Callbacks | `GET /staff/api/executions/callbacks?status=&token_status=&from_date=&to_date=` | Not implemented; uses mock |
| Requests | `GET /staff/api/requests?method=&status=&path=&agent_id=&from_date=&to_date=` | Not implemented; uses mock |
| Requests | `GET /staff/api/requests/:id` | Request timeline; not implemented |
| Audit Log | `GET /staff/api/audit?event_type=&actor_type=&target_type=&from_date=&to_date=` | **Exists** |
| Metrics | `GET /staff/api/metrics?range=` | Not implemented; uses mock |
| Health | `GET /staff/api/health` | Not implemented; uses mock in Config |
| Data Retention | `GET /staff/api/data-retention` | Not implemented; uses mock |
| Data Retention | `PATCH /staff/api/data-retention` | Update settings |
| Data Retention | `GET /staff/api/data-retention/preview` | Preview impact |
| Data Retention | `POST /staff/api/data-retention/run` | Run cleanup |

**Existing endpoints used:**
- `api.audit` — Audit Log (already exists)
- `api.serviceResume` — delegates to admin services resume (if wired)
- `api.agents`, `api.services`, `api.executions` — extended columns require backend to return new fields

---

## 8. UX Rules Applied

- Tables first, charts second
- Read-only by default
- Dangerous actions (Block, Run cleanup, Pause) require confirmation
- No inline editing except settings (Data Retention)
- Consistent empty states: "No events in selected period" / "No data in selected filters"
- Mock data fallback when backend returns 404 — UI remains functional for development and demo
