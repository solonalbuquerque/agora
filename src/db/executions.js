'use strict';

const crypto = require('crypto');
const { query } = require('./index');
const { v4: uuidv4 } = require('uuid');

function generateCallbackToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function create(client, requester_agent_id, service_id, requestPayload) {
  const callbackToken = generateCallbackToken();
  const res = await client.query(
    `INSERT INTO executions (uuid, requester_agent_id, service_id, status, request, callback_token)
     VALUES ($1, $2, $3, 'pending', $4, $5)
     RETURNING id, uuid, requester_agent_id, service_id, status, request, callback_token, created_at`,
    [uuidv4(), requester_agent_id, service_id, requestPayload ? JSON.stringify(requestPayload) : null, callbackToken]
  );
  return res.rows[0];
}

async function updateResult(client, id, status, response, latencyMs) {
  await client.query(
    `UPDATE executions SET status = $1, response = $2, latency_ms = $3 WHERE id = $4`,
    [status, response ? JSON.stringify(response) : null, latencyMs, id]
  );
}

/** Only update if status is still pending or awaiting_callback (idempotent: first result wins). Returns true if updated. */
async function updateResultIfPending(client, id, status, response, latencyMs) {
  const res = await client.query(
    `UPDATE executions SET status = $1, response = $2, latency_ms = $3
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

/** Returns execution including callback_token (for callback verification). Do not expose callback_token to API responses. */
async function getByUuid(uuid) {
  const res = await query(
    'SELECT id, uuid, requester_agent_id, service_id, status, request, response, latency_ms, callback_token, created_at FROM executions WHERE uuid = $1',
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

module.exports = {
  create,
  updateResult,
  updateResultIfPending,
  setAwaitingCallback,
  getById,
  getByUuid,
  listByRequester,
};
