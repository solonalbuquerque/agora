'use strict';

const crypto = require('crypto');

const TIMESTAMP_WINDOW_SEC = 5 * 60; // 5 minutes

/**
 * Build the canonical signing payload for HMAC-SHA256.
 * Format: agentId + "\n" + timestamp + "\n" + method + "\n" + path + "\n" + bodyHash
 * path = canonical path (path without query string); query string is not included in the signature.
 */
function buildSigningPayload(agentId, timestamp, method, path, bodyHash) {
  return [agentId, timestamp, method, path, bodyHash || ''].join('\n');
}

/**
 * Compute SHA-256 hex hash of a string (e.g. raw body).
 */
function sha256Hex(str) {
  return crypto.createHash('sha256').update(str || '', 'utf8').digest('hex');
}

/**
 * Compute HMAC-SHA256 signature (hex) of the signing payload using the agent secret.
 */
function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Verify timestamp is within the allowed window (e.g. 5 minutes from now).
 */
function isTimestampValid(timestampStr) {
  const t = parseInt(timestampStr, 10);
  if (Number.isNaN(t)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - t) <= TIMESTAMP_WINDOW_SEC;
}

/**
 * Verify HMAC signature for a request.
 * getAgentSecret: async (agentId) => secret or null
 */
async function verifySignature(agentId, timestamp, method, path, rawBody, signatureHex, getAgentSecret) {
  if (!agentId || !timestamp || !signatureHex) return null;
  if (!isTimestampValid(timestamp)) return null;
  const secret = await getAgentSecret(agentId);
  if (!secret) return null;
  const bodyHash = sha256Hex(rawBody);
  const payload = buildSigningPayload(agentId, timestamp, method, path, bodyHash);
  const expected = sign(secret, payload);
  return crypto.timingSafeEqual(Buffer.from(signatureHex, 'hex'), Buffer.from(expected, 'hex'))
    ? agentId
    : null;
}

/**
 * Fastify preHandler hook: require HMAC auth. Expects headers X-Agent-Id, X-Timestamp, X-Signature.
 * Injects request.agentId when valid. getAgentSecret(agentId) must return the agent's secret.
 */
function requireAgentAuth(getAgentSecret) {
  return async function preHandler(request, reply) {
    const agentId = request.headers['x-agent-id'];
    const timestamp = request.headers['x-timestamp'];
    const signature = request.headers['x-signature'];
    const method = request.method;
    const path = request.url.split('?')[0]; // canonical path (no query string)
    const rawBody = request.rawBody != null ? request.rawBody : (request.body ? JSON.stringify(request.body) : '');
    const verified = await verifySignature(agentId, timestamp, method, path, rawBody, signature, getAgentSecret);
    if (!verified) {
      return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid or missing agent signature' });
    }
    request.agentId = verified;
  };
}

module.exports = {
  buildSigningPayload,
  sha256Hex,
  sign,
  isTimestampValid,
  verifySignature,
  requireAgentAuth,
};
