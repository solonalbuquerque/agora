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

module.exports = {
  create,
  getById,
  getSecretById,
  updateStatus,
};
