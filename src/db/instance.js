'use strict';

const { query } = require('./index');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

async function register(name, ownerEmail) {
  const id = uuidv4();
  const registrationCode = crypto.randomBytes(16).toString('hex');
  const registrationCodeHash = hashToken(registrationCode);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await query(
    `INSERT INTO instance (id, name, owner_email, status) VALUES ($1, $2, $3, 'pending')`,
    [id, name, ownerEmail]
  );
  await query(
    `INSERT INTO instance_registration_requests (instance_id, registration_code_hash, expires_at) VALUES ($1, $2, $3)`,
    [id, registrationCodeHash, expiresAt]
  );
  return { id, name, owner_email: ownerEmail, status: 'pending', registration_code: registrationCode, expires_at: expiresAt };
}

async function activate(instanceId, registrationCode, activationToken, officialIssuerId = null) {
  const codeHash = hashToken((registrationCode || '').toString());
  const res = await query(
    `SELECT ir.id, ir.instance_id FROM instance_registration_requests ir
     JOIN instance i ON i.id = ir.instance_id
     WHERE ir.instance_id = $1 AND ir.registration_code_hash = $2 AND ir.used_at IS NULL AND ir.expires_at > NOW()`,
    [instanceId, codeHash]
  );
  if (res.rows.length === 0) return null;
  const activationTokenHash = hashToken((activationToken || '').toString());
  await query(
    `UPDATE instance_registration_requests SET used_at = NOW() WHERE id = $1`,
    [res.rows[0].id]
  );
  await query(
    `UPDATE instance SET status = 'registered', registered_at = NOW(), activation_token_hash = $1, official_issuer_id = $2 WHERE id = $3`,
    [activationTokenHash, officialIssuerId || null, instanceId]
  );
  return getById(instanceId);
}

async function getById(id) {
  const res = await query(
    `SELECT id, name, owner_email, status, created_at, registered_at, last_seen_at, official_issuer_id FROM instance WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function findByActivationToken(token) {
  const tokenHash = hashToken((token || '').toString());
  const res = await query(
    `SELECT id, name, owner_email, status, created_at, registered_at, last_seen_at, official_issuer_id FROM instance WHERE activation_token_hash = $1`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

async function updateLastSeen(id) {
  await query(`UPDATE instance SET last_seen_at = NOW() WHERE id = $1`, [id]);
}

async function updateStatus(id, status) {
  const valid = ['unregistered', 'pending', 'registered', 'flagged', 'blocked'];
  if (!valid.includes(status)) return null;
  const res = await query(
    `UPDATE instance SET status = $1 WHERE id = $2 RETURNING id, name, owner_email, status, created_at, registered_at, last_seen_at, official_issuer_id`,
    [status, id]
  );
  return res.rows[0] || null;
}

/**
 * Cria/atualiza instância a partir da resposta do Central (register).
 * Usado quando o register é feito na Central; o id vem da Central.
 */
async function registerFromCentral(instanceId, name, ownerEmail) {
  await query(
    `INSERT INTO instance (id, name, owner_email, status) VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (id) DO UPDATE SET name = $2, owner_email = $3
     WHERE instance.status IN ('unregistered', 'pending')`,
    [instanceId, name, ownerEmail]
  );
  return getById(instanceId);
}

/**
 * Ativa a instância apenas com o token (fluxo Central: token obtido via POST /instances/activate).
 * Não valida registration_code local.
 */
async function activateWithToken(instanceId, activationToken, officialIssuerId = null) {
  const activationTokenHash = hashToken((activationToken || '').toString());
  const res = await query(
    `UPDATE instance SET status = 'registered', registered_at = NOW(), activation_token_hash = $1, official_issuer_id = $2 WHERE id = $3
     RETURNING id, name, owner_email, status, created_at, registered_at, last_seen_at, official_issuer_id`,
    [activationTokenHash, officialIssuerId || null, instanceId]
  );
  return res.rows[0] || null;
}

module.exports = {
  hashToken,
  register,
  registerFromCentral,
  activate,
  activateWithToken,
  getById,
  findByActivationToken,
  updateLastSeen,
  updateStatus,
};
