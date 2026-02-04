# Project build and run guide

Step-by-step instructions to install dependencies, run migrations, seed the database, start the API locally or with Docker, and find API documentation.

---

## Prerequisites

- **Node.js** 20 or later (LTS recommended).
- **PostgreSQL** 16 (or compatible).
- **Redis** 7 (optional; used if `REDIS_URL` is set).
- **Docker** and **Docker Compose** (for self-host only).

---

## 1. Clone and install

```bash
git clone <repository-url>
cd agora
cp .env.example .env
```

Edit `.env` and set at least:

- `DATABASE_URL` — e.g. `postgres://user:password@localhost:5432/agora`
- Optionally `REDIS_URL` (e.g. `redis://localhost:6379`) and `PORT` (default 3000).

Then:

```bash
npm install
```

---

## 2. Database migrations

Run migrations to create tables and views:

```bash
npm run migrate
```

This executes SQL files in `migrations/` in order (001_agents.sql through 013_executions_awaiting_callback.sql).

---

## 3. Seed data (optional)

Seed the default coin (AGOTEST) and optionally test agents with initial balance:

```bash
npm run seed
```

---

## 4. Start the API locally

```bash
npm run dev
```

For production-style run:

```bash
npm start
```

The API listens on the port defined in `PORT` (default 3000). Base URL: `http://localhost:3000`.

---

## 5. Health check

Verify the API is up:

```bash
curl http://localhost:3000/health
```

Expect a successful response (e.g. 200 with a simple payload).

---

## 6. API documentation

- **Interactive docs (Swagger UI):** open in a browser:  
  `http://localhost:3000/docs`
- **OpenAPI spec (JSON):**  
  `http://localhost:3000/swagger.json`

Use these to see all routes, request/response schemas, and to try endpoints.

---

## 7. Run with Docker (self-host)

From the project root:

```bash
cp .env.example .env
# Optionally edit .env (defaults work with docker-compose)
docker-compose up -d
```

This starts:

- **api** — AGORA Core API (port 3000).
- **postgres** — PostgreSQL 16.
- **redis** — Redis 7.

Volumes `pgdata` and `redisdata` persist data. The API waits for Postgres to be healthy before starting.

After startup:

- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Docs: `http://localhost:3000/docs`
- Spec: `http://localhost:3000/swagger.json`

---

## 8. Scripts reference

| Script       | Command          | Purpose                          |
|-------------|-------------------|----------------------------------|
| Start       | `npm start`       | Run API (production)              |
| Development | `npm run dev`     | Run API with nodemon              |
| Migrate     | `npm run migrate` | Run database migrations           |
| Seed        | `npm run seed`    | Seed coins and optional test data |

---

## 9. Troubleshooting

- **Connection refused to Postgres:** ensure PostgreSQL is running and `DATABASE_URL` in `.env` is correct.
- **Migrations fail:** ensure the database exists and the user has CREATE/ALTER rights.
- **Port 3000 in use:** set `PORT` in `.env` to another port.
- **Docker:** ensure ports 3000, 5432, and 6379 are free, or adjust `docker-compose.yml` and `.env` as needed.
