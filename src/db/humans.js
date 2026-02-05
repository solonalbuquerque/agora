'use strict';

const { query } = require('./index');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

async function createHuman(email) {
  const emailNorm = (email || '').toString().toLowerCase().trim();
  const existing = await getHumanByEmail(emailNorm);
  if (existing) {
    await query(`UPDATE humans SET status = 'pending', verified_at = NULL WHERE id = $1`, [existing.id]);
    return getHumanById(existing.id);
  }
  const id = uuidv4();
  await query(`INSERT INTO humans (id, email, status) VALUES ($1, $2, 'pending')`, [id, emailNorm]);
  return getHumanById(id);
}

async function getHumanById(id) {
  const res = await query('SELECT id, email, status, created_at, verified_at FROM humans WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function getHumanByEmail(email) {
  const res = await query('SELECT id, email, status, created_at, verified_at FROM humans WHERE LOWER(email) = $1', [(email || '').toString().toLowerCase()]);
  return res.rows[0] || null;
}

async function createVerification(humanId, ttlSeconds = 86400) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await query(
    `INSERT INTO human_verifications (human_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [humanId, tokenHash, expiresAt]
  );
  return { token, expiresAt };
}

async function consumeVerification(token) {
  const tokenHash = hashToken((token || '').toString());
  const res = await query(
    `UPDATE human_verifications SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() RETURNING human_id`,
    [tokenHash]
  );
  if (res.rows.length === 0) return null;
  await query(`UPDATE humans SET status = 'verified', verified_at = NOW() WHERE id = $1`, [res.rows[0].human_id]);
  return res.rows[0].human_id;
}

async function getVerificationByToken(token) {
  const tokenHash = hashToken((token || '').toString());
  const res = await query(
    `SELECT human_id FROM human_verifications WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

async function linkAgent(humanId, agentId, role = 'owner') {
  await query(
    `INSERT INTO human_agents (human_id, agent_id, role) VALUES ($1, $2, $3) ON CONFLICT (human_id, agent_id) DO UPDATE SET role = $3`,
    [humanId, agentId, role]
  );
}

async function getAgentsByHumanId(humanId) {
  const res = await query(
    `SELECT ha.agent_id, ha.role, ha.created_at FROM human_agents ha WHERE ha.human_id = $1 ORDER BY ha.created_at`,
    [humanId]
  );
  return res.rows;
}

async function getHumansByAgentId(agentId) {
  const res = await query(
    `SELECT h.id, h.email, h.status, ha.role FROM human_agents ha JOIN humans h ON h.id = ha.human_id WHERE ha.agent_id = $1`,
    [agentId]
  );
  return res.rows;
}

async function updateStatus(id, status) {
  const res = await query(
    'UPDATE humans SET status = $1 WHERE id = $2 RETURNING id, email, status, created_at, verified_at',
    [status, id]
  );
  return res.rows[0] || null;
}

async function list(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  let where = '1=1';
  const params = [];
  let paramIndex = 1;
  
  if (filters.status) {
    params.push(filters.status);
    where += ` AND status = $${paramIndex++}`;
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where += ` AND (id::text ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
    paramIndex++;
  }
  
  // Count query
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM humans WHERE ${where}`, params);
  const total = countRes.rows[0]?.total ?? 0;
  
  // Data query - add limit and offset to params
  const dataParams = [...params];
  dataParams.push(limit, offset);
  const limitParamIndex = paramIndex;
  const offsetParamIndex = paramIndex + 1;
  
  const res = await query(
    `SELECT id, email, status, created_at, verified_at FROM humans WHERE ${where} ORDER BY created_at DESC LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
    dataParams
  );
  
  const rows = Array.isArray(res?.rows) ? res.rows : [];
  return { rows, total };
}

module.exports = {
  hashToken,
  createHuman,
  getHumanById,
  getHumanByEmail,
  createVerification,
  consumeVerification,
  getVerificationByToken,
  linkAgent,
  getAgentsByHumanId,
  getHumansByAgentId,
  updateStatus,
  list,
};
