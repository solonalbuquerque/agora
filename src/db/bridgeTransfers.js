'use strict';

const { query, withTransaction } = require('./index');
const { v4: uuidv4 } = require('uuid');

async function create(data) {
  const id = uuidv4();
  const {
    kind,
    from_agent_id,
    coin,
    amount_cents,
    to_instance_id = null,
    to_agent_id = null,
    destination_ref = null,
    external_ref = null,
    request_id = null,
  } = data;
  await query(
    `INSERT INTO bridge_transfers (id, kind, from_agent_id, coin, amount_cents, to_instance_id, to_agent_id, destination_ref, external_ref, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, kind, from_agent_id, coin, amount_cents, to_instance_id, to_agent_id, destination_ref, external_ref || null, request_id || null]
  );
  return getById(id);
}

async function getById(id) {
  const res = await query(
    `SELECT id, kind, from_agent_id, coin, amount_cents, to_instance_id, to_agent_id, destination_ref, status, reject_reason, external_ref, request_id, created_at, updated_at
     FROM bridge_transfers WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function getByExternalRef(externalRef) {
  const res = await query(
    'SELECT id, kind, from_agent_id, coin, amount_cents, status, external_ref, created_at FROM bridge_transfers WHERE external_ref = $1',
    [externalRef]
  );
  return res.rows[0] || null;
}

async function updateStatus(id, status, rejectReason = null) {
  await query(
    `UPDATE bridge_transfers SET status = $1, reject_reason = $2, updated_at = NOW() WHERE id = $3`,
    [status, rejectReason || null, id]
  );
  return getById(id);
}

async function getPendingSummary() {
  const res = await query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_cents), 0)::bigint AS total_cents FROM bridge_transfers WHERE status = 'pending'`,
    []
  );
  const row = res.rows[0];
  return { count: row ? Number(row.count) : 0, total_cents: row ? Number(row.total_cents) : 0 };
}

async function list(filters = {}) {
  const { status, kind, coin, from_date, to_date, limit = 50, offset = 0 } = filters;
  let where = '1=1';
  const params = [];
  let i = 1;
  if (status) {
    params.push(status);
    where += ` AND status = $${i++}`;
  }
  if (kind) {
    params.push(kind);
    where += ` AND kind = $${i++}`;
  }
  if (coin) {
    params.push(coin);
    where += ` AND coin = $${i++}`;
  }
  if (from_date) {
    params.push(from_date);
    where += ` AND created_at >= $${i}::date`;
    i += 1;
  }
  if (to_date) {
    params.push(to_date);
    where += ` AND created_at < ($${i}::date + interval '1 day')`;
    i += 1;
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM bridge_transfers WHERE ${where}`, params);
  const total = countRes.rows[0]?.total ?? 0;
  params.push(safeLimit, safeOffset);
  const res = await query(
    `SELECT id, kind, from_agent_id, coin, amount_cents, to_instance_id, to_agent_id, destination_ref, status, reject_reason, external_ref, request_id, created_at, updated_at
     FROM bridge_transfers WHERE ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return { rows: res.rows, total };
}

module.exports = {
  create,
  getById,
  getByExternalRef,
  updateStatus,
  list,
  getPendingSummary,
};
