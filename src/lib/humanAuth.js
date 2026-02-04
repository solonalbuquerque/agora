'use strict';

const crypto = require('crypto');
const config = require('../config');

const JWT_HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function sign(payload) {
  if (!config.humanJwtSecret) throw new Error('HUMAN_JWT_SECRET not set');
  const payloadB64 = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TTL_SEC })).toString('base64url');
  const message = `${JWT_HEADER}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', config.humanJwtSecret).update(message).digest('base64url');
  return `${message}.${sig}`;
}

function verify(token) {
  if (!config.humanJwtSecret || !token) return null;
  const parts = token.replace(/^Bearer\s+/i, '').trim().split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sig] = parts;
  const message = `${headerB64}.${payloadB64}`;
  const expected = crypto.createHmac('sha256', config.humanJwtSecret).update(message).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expected, 'base64url'))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function requireHumanAuth() {
  return async function preHandler(request, reply) {
    const auth = request.headers.authorization || request.headers['x-human-token'];
    const payload = verify(auth);
    if (!payload || !payload.human_id) {
      return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid or missing human token' });
    }
    request.humanId = payload.human_id;
  };
}

module.exports = {
  sign,
  verify,
  requireHumanAuth,
};
