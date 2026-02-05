'use strict';

const crypto = require('crypto');
const config = require('../config');

const JWT_HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const TTL_SEC = 8 * 60 * 60; // 8 hours
const TTL_2FA_PENDING_SEC = 2 * 60; // 2 minutes

function getSecret() {
  return config.staffJwtSecret || config.humanJwtSecret || '';
}

function sign() {
  const secret = getSecret();
  if (!secret) throw new Error('STAFF_JWT_SECRET or HUMAN_JWT_SECRET not set');
  const payload = { staff: true, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TTL_SEC };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `${JWT_HEADER}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(message).digest('base64url');
  return `${message}.${sig}`;
}

function verify(token) {
  const secret = getSecret();
  if (!secret || !token) return null;
  const raw = (typeof token === 'string' ? token : '').replace(/^Bearer\s+/i, '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sig] = parts;
  const message = `${headerB64}.${payloadB64}`;
  const expected = crypto.createHmac('sha256', secret).update(message).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expected, 'base64url'))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload.staff || (payload.exp && payload.exp < Math.floor(Date.now() / 1000))) return null;
  return payload;
}

function sign2faPending() {
  const secret = getSecret();
  if (!secret) throw new Error('STAFF_JWT_SECRET not set');
  const payload = { step: '2fa_pending', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TTL_2FA_PENDING_SEC };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `${JWT_HEADER}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(message).digest('base64url');
  return `${message}.${sig}`;
}

function verify2faPending(token) {
  const secret = getSecret();
  if (!secret || !token) return null;
  const parts = (typeof token === 'string' ? token : '').trim().split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sig] = parts;
  const message = `${headerB64}.${payloadB64}`;
  const expected = crypto.createHmac('sha256', secret).update(message).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expected, 'base64url'))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (payload.step !== '2fa_pending' || (payload.exp && payload.exp < Math.floor(Date.now() / 1000))) return null;
  return payload;
}

/**
 * PreHandler: staff is authorized if X-Staff-Token or X-Admin-Token matches config, or JWT (cookie staff_session or Authorization) is valid.
 */
function requireStaff(request, reply, done) {
  const staffToken = request.headers['x-staff-token'] || request.headers['x-admin-token'];
  const tokenStr = (staffToken || '').toString();
  if (config.staffToken && tokenStr && config.staffToken.length === tokenStr.length && crypto.timingSafeEqual(Buffer.from(config.staffToken, 'utf8'), Buffer.from(tokenStr, 'utf8'))) {
    request.staff = true;
    return done();
  }
  const cookieToken = request.cookies?.staff_session;
  const authHeader = request.headers.authorization;
  const jwt = cookieToken || authHeader;
  const payload = verify(jwt);
  if (payload) {
    request.staff = true;
    return done();
  }
  return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid or missing staff token' });
}

module.exports = {
  sign,
  verify,
  sign2faPending,
  verify2faPending,
  requireStaff,
};
