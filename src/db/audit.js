'use strict';

const { query } = require('./index');

/**
 * Insert an audit event. All fields optional except event_type and actor_type.
 */
async function insert(event) {
  const q = `INSERT INTO audit_events (id, event_type, actor_type, actor_id, target_type, target_id, metadata, request_id)
              VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
              RETURNING id, event_type, actor_type, actor_id, target_type, target_id, metadata, request_id, created_at`;
  const r = await query(q, [
    event.event_type,
    event.actor_type,
    event.actor_id ?? null,
    event.target_type ?? null,
    event.target_id ?? null,
    event.metadata ? JSON.stringify(event.metadata) : null,
    event.request_id ?? null,
  ]);
  return r.rows[0];
}

/**
 * List audit events with filters: actor_type, actor_id, event_type, from_date, to_date, limit, offset.
 */
async function list(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  let where = '1=1';
  const params = [];
  let i = 1;
  if (filters.actor_type) {
    params.push(filters.actor_type);
    where += ` AND actor_type = $${i++}`;
  }
  if (filters.actor_id) {
    params.push(filters.actor_id);
    where += ` AND actor_id = $${i++}`;
  }
  if (filters.event_type) {
    params.push(filters.event_type);
    where += ` AND event_type = $${i++}`;
  }
  if (filters.from_date) {
    params.push(filters.from_date);
    where += ` AND created_at >= $${i++}::timestamptz`;
  }
  if (filters.to_date) {
    params.push(filters.to_date);
    where += ` AND created_at <= $${i++}::timestamptz`;
  }
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM audit_events WHERE ${where}`, params);
  const total = countRes.rows[0]?.total ?? 0;
  params.push(limit, offset);
  const res = await query(
    `SELECT id, event_type, actor_type, actor_id, target_type, target_id, metadata, request_id, created_at
     FROM audit_events WHERE ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return { rows: res.rows, total };
}

module.exports = { insert, list };
