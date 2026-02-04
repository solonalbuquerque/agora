'use strict';

const { query } = require('./index');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

async function createIssuer(name, publicKeyOrSecret, useSecret = true) {
  const id = uuidv4();
  const secret = useSecret ? publicKeyOrSecret : null;
  const publicKey = useSecret ? null : publicKeyOrSecret;
  await query(
    `INSERT INTO issuers (id, name, status, public_key, secret) VALUES ($1, $2, 'active', $3, $4)`,
    [id, name, publicKey, secret]
  );
  return getById(id);
}

async function getById(id) {
  const res = await query(
    'SELECT id, name, status, public_key, created_at, revoked_at FROM issuers WHERE id = $1',
    [id]
  );
  return res.rows[0] || null;
}

function getSecretById(id) {
  return query('SELECT secret FROM issuers WHERE id = $1 AND status = $2', [id, 'active'])
    .then((res) => (res.rows[0] ? res.rows[0].secret : null));
}

function verifySignature(secret, payload, signatureHex) {
  const expected = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signatureHex, 'hex'), Buffer.from(expected, 'hex'));
}

async function revoke(id) {
  await query(`UPDATE issuers SET status = 'revoked', revoked_at = NOW() WHERE id = $1`, [id]);
  return getById(id);
}

module.exports = {
  createIssuer,
  getById,
  getSecretById,
  verifySignature,
  revoke,
};
