'use strict';

const { query } = require('./index');
const { v4: uuidv4 } = require('uuid');

async function create(client, requester_agent_id, service_id, requestPayload) {
  const res = await client.query(
    `INSERT INTO executions (uuid, requester_agent_id, service_id, status, request)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING id, uuid, requester_agent_id, service_id, status, request, created_at`,
    [uuidv4(), requester_agent_id, service_id, requestPayload ? JSON.stringify(requestPayload) : null]
  );
  return res.rows[0];
}

async function updateResult(client, id, status, response, latencyMs) {
  await client.query(
    `UPDATE executions SET status = $1, response = $2, latency_ms = $3 WHERE id = $4`,
    [status, response ? JSON.stringify(response) : null, latencyMs, id]
  );
}

async function getById(id) {
  const res = await query(
    'SELECT id, uuid, requester_agent_id, service_id, status, request, response, latency_ms, created_at FROM executions WHERE id = $1',
    [id]
  );
  return res.rows[0] || null;
}

module.exports = {
  create,
  updateResult,
  getById,
};
