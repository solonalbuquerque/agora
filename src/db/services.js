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
    price_cents_usd = 0,
  } = data;
  await query(
    `INSERT INTO services (id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents_usd, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
    [
      id,
      owner_agent_id,
      name,
      description,
      webhook_url,
      input_schema ? JSON.stringify(input_schema) : null,
      output_schema ? JSON.stringify(output_schema) : null,
      price_cents_usd,
    ]
  );
  return getById(id);
}

async function getById(id) {
  const res = await query(
    `SELECT id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents_usd, status, created_at
     FROM services WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function list(filters = {}) {
  const { status, owner_agent_id } = filters;
  let sql = `SELECT id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents_usd, status, created_at
             FROM services WHERE 1=1`;
  const params = [];
  let i = 1;
  if (status) {
    params.push(status);
    sql += ` AND status = $${i++}`;
  }
  if (owner_agent_id) {
    params.push(owner_agent_id);
    sql += ` AND owner_agent_id = $${i++}`;
  }
  sql += ' ORDER BY created_at DESC';
  const res = await query(sql, params);
  return res.rows;
}

module.exports = {
  create,
  getById,
  list,
};
