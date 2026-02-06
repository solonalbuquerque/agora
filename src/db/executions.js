'use strict';

const crypto = require('crypto');
const { query } = require('./index');
const { v4: uuidv4 } = require('uuid');

function generateCallbackToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** Default callback token validity: 24 hours from now */
function defaultCallbackExpiresAt() {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return d;
}

async function create(client, requester_agent_id, service_id, requestPayload, idempotencyKey = null, requestId = null) {
  const callbackToken = generateCallbackToken();
  const expiresAt = defaultCallbackExpiresAt();
  const res = await client.query(
    `INSERT INTO executions (uuid, requester_agent_id, service_id, status, request, callback_token, idempotency_key, callback_token_expires_at, request_id)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8)
     RETURNING id, uuid, requester_agent_id, service_id, status, request, callback_token, callback_token_expires_at, idempotency_key, created_at, request_id`,
    [uuidv4(), requester_agent_id, service_id, requestPayload ? JSON.stringify(requestPayload) : null, callbackToken, idempotencyKey || null, expiresAt, requestId || null]
  );
  return res.rows[0];
}

/** Find existing execution by idempotency key (agent + service + key). Returns row without callback_token. Use withTransaction if you need it inside a transaction. */
async function findByIdempotency(client, requester_agent_id, service_id, idempotency_key) {
  if (!idempotency_key) return null;
  const res = await client.query(
    `SELECT id, uuid, requester_agent_id, service_id, status, request, response, latency_ms, created_at
     FROM executions WHERE requester_agent_id = $1 AND service_id = $2 AND idempotency_key = $3`,
    [requester_agent_id, service_id, idempotency_key]
  );
  return res.rows[0] || null;
}

/** Same as findByIdempotency but using pool query (no transaction). */
async function findByIdempotencyReadOnly(requester_agent_id, service_id, idempotency_key) {
  if (!idempotency_key) return null;
  const res = await query(
    `SELECT id, uuid, requester_agent_id, service_id, status, request, response, latency_ms, created_at
     FROM executions WHERE requester_agent_id = $1 AND service_id = $2 AND idempotency_key = $3`,
    [requester_agent_id, service_id, idempotency_key]
  );
  return res.rows[0] || null;
}

async function updateResult(client, id, status, response, latencyMs) {
  await client.query(
    `UPDATE executions SET status = $1, response = $2, latency_ms = $3 WHERE id = $4`,
    [status, response ? JSON.stringify(response) : null, latencyMs, id]
  );
}

/** Only update if status is still pending or awaiting_callback (idempotent: first result wins). Sets callback_received_at. Returns true if updated. */
async function updateResultIfPending(client, id, status, response, latencyMs) {
  const res = await client.query(
    `UPDATE executions SET status = $1, response = $2, latency_ms = $3, callback_received_at = NOW()
     WHERE id = $4 AND status IN ('pending', 'awaiting_callback')
     RETURNING id`,
    [status, response ? JSON.stringify(response) : null, latencyMs, id]
  );
  return res.rowCount > 0;
}

async function getById(id) {
  const res = await query(
    'SELECT id, uuid, requester_agent_id, service_id, status, request, response, latency_ms, created_at FROM executions WHERE id = $1',
    [id]
  );
  return res.rows[0] || null;
}

/** Set execution to awaiting_callback when we return early (timeout); result will come via callback. */
async function setAwaitingCallback(id) {
  const res = await query(
    `UPDATE executions SET status = 'awaiting_callback' WHERE id = $1 AND status = 'pending' RETURNING id`,
    [id]
  );
  return res.rowCount > 0;
}

/** Returns execution including callback_token, callback_token_expires_at, callback_received_at (for callback verification). Do not expose callback_token to API responses. */
async function getByUuid(uuid) {
  const res = await query(
    `SELECT id, uuid, requester_agent_id, service_id, status, request, response, latency_ms, callback_token,
            callback_token_expires_at, callback_received_at, created_at
     FROM executions WHERE uuid = $1`,
    [uuid]
  );
  return res.rows[0] || null;
}

/** List executions by requester with filters and pagination. Returns { rows, total }. */
async function listByRequester(requesterAgentId, filters = {}) {
  const { status, service_id, limit = 20, offset = 0 } = filters;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  let where = 'requester_agent_id = $1';
  const params = [requesterAgentId];
  let i = 2;
  if (status) {
    params.push(status);
    where += ` AND status = $${i++}`;
  }
  if (service_id) {
    params.push(service_id);
    where += ` AND service_id = $${i++}`;
  }

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM executions WHERE ${where}`,
    params
  );
  const total = countRes.rows[0]?.total ?? 0;

  params.push(safeLimit, safeOffset);
  const res = await query(
    `SELECT id, uuid, requester_agent_id, service_id, status, request, response, latency_ms, created_at
     FROM executions WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return { rows: res.rows, total };
}

/** List all executions (staff). Filters: status, service_id, requester_agent_id, q, limit, offset. */
async function listAll(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  let where = '1=1';
  const params = [];
  let i = 1;
  if (filters.status) {
    params.push(filters.status);
    where += ` AND status = $${i++}`;
  }
  if (filters.service_id) {
    params.push(filters.service_id);
    where += ` AND service_id = $${i++}`;
  }
  if (filters.requester_agent_id) {
    params.push(filters.requester_agent_id);
    where += ` AND requester_agent_id = $${i++}`;
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where += ` AND (uuid::text ILIKE $${i} OR requester_agent_id ILIKE $${i} OR service_id ILIKE $${i})`;
    i++;
  }
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM executions WHERE ${where}`, params);
  const total = countRes.rows[0]?.total ?? 0;
  params.push(limit, offset);
  const res = await query(
    `SELECT id, uuid, requester_agent_id, service_id, status, request, response, latency_ms, created_at
     FROM executions WHERE ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return { rows: res.rows, total };
}

module.exports = {
  create,
  findByIdempotency,
  findByIdempotencyReadOnly,
  updateResult,
  updateResultIfPending,
  setAwaitingCallback,
  getById,
  getByUuid,
  listByRequester,
  listAll,
};
