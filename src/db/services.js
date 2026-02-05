'use strict';

const { query } = require('./index');
const { serviceId } = require('../lib/ids');

async function create(data) {
  const id = serviceId();
  const {
    owner_agent_id,
    name,
    description = '',
    webhook_url,
    input_schema = null,
    output_schema = null,
    price_cents = 0,
    coin = 'AGOTEST',
  } = data;
  await query(
    `INSERT INTO services (id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents, coin, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')`,
    [
      id,
      owner_agent_id,
      name,
      description,
      webhook_url,
      input_schema ? JSON.stringify(input_schema) : null,
      output_schema ? JSON.stringify(output_schema) : null,
      price_cents,
      (coin || 'AGOTEST').toString().slice(0, 16),
    ]
  );
  return getById(id);
}

async function getById(id) {
  const res = await query(
    `SELECT id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents, coin, status, created_at
     FROM services WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function list(filters = {}) {
  let { status, owner_agent_id, coin, q, limit = 50, offset = 0 } = filters;
  if (status === undefined || status === null) {
    status = 'active';
  }
  let whereSql = ' WHERE 1=1';
  const params = [];
  let i = 1;
  if (status) {
    params.push(status);
    whereSql += ` AND status = $${i++}`;
  }
  if (owner_agent_id) {
    params.push(owner_agent_id);
    whereSql += ` AND owner_agent_id = $${i++}`;
  }
  if (coin) {
    params.push(coin);
    whereSql += ` AND coin = $${i++}`;
  }
  if (q != null && q !== '') {
    params.push(q);
    whereSql += ` AND (position(lower($${i}) in lower(name)) > 0 OR position(lower($${i}) in lower(COALESCE(description, ''))) > 0 OR (input_schema IS NOT NULL AND position(lower($${i}) in lower(input_schema::text)) > 0))`;
    i++;
  }
  
  // Count total
  const countRes = await query(`SELECT COUNT(*) as total FROM services${whereSql}`, params);
  const total = parseInt(countRes.rows[0]?.total || 0, 10);
  
  // Get rows with pagination
  const sql = `SELECT id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents, coin, status, created_at
               FROM services${whereSql} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`;
  params.push(Number(limit) || 50, Number(offset) || 0);
  const res = await query(sql, params);
  return { rows: res.rows, total };
}

async function update(id, data) {
  const allowed = ['name', 'description', 'webhook_url', 'input_schema', 'output_schema', 'price_cents', 'coin', 'status'];
  const updates = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (!(key in data)) continue;
    let val = data[key];
    if (key === 'input_schema' || key === 'output_schema') {
      val = val != null ? JSON.stringify(val) : null;
    }
    if (key === 'status' && val != null) {
      if (!['active', 'paused', 'removed'].includes(val)) continue;
    }
    if (key === 'coin' && val != null) val = String(val).slice(0, 16);
    updates.push(`${key} = $${i++}`);
    values.push(val);
  }
  if (updates.length === 0) return getById(id);
  values.push(id);
  const sql = `UPDATE services SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents, coin, status, created_at`;
  const res = await query(sql, values);
  return res.rows[0] || null;
}

module.exports = {
  create,
  getById,
  list,
  update,
};
