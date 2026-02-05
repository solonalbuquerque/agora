'use strict';

const { query } = require('./index');
const { agentId } = require('../lib/ids');
const crypto = require('crypto');

/**
 * Generate a random secret (opaque string). Do not log this.
 */
function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new agent. Returns { id, secret } — secret is only returned here.
 */
async function create(name) {
  const id = agentId();
  const secret = generateSecret();
  await query(
    `INSERT INTO agents (id, name, secret, status, trust_level)
     VALUES ($1, $2, $3, 'active', 0)`,
    [id, name || 'anonymous', secret]
  );
  return { id, secret };
}

async function getById(id) {
  const res = await query('SELECT id, name, status, trust_level, created_at FROM agents WHERE id = $1', [id]);
  return res.rows[0] || null;
}

/**
 * Return the agent's secret for HMAC verification. Do not log the result.
 */
async function getSecretById(id) {
  const res = await query('SELECT secret FROM agents WHERE id = $1', [id]);
  return res.rows[0] ? res.rows[0].secret : null;
}

async function updateStatus(id, status) {
  await query('UPDATE agents SET status = $1 WHERE id = $2', [status, id]);
}

async function list(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  let where = '1=1';
  const params = [];
  let i = 1;
  if (filters.status) {
    params.push(filters.status);
    where += ` AND status = $${i++}`;
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where += ` AND (id ILIKE $${i} OR name ILIKE $${i})`;
    i++;
  }
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM agents WHERE ${where}`, params);
  const total = countRes.rows[0]?.total ?? 0;
  params.push(limit, offset);
  const res = await query(
    `SELECT id, name, status, trust_level, created_at FROM agents WHERE ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return { rows: res.rows, total };
}

module.exports = {
  create,
  getById,
  getSecretById,
  updateStatus,
  list,
};
