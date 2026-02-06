'use strict';

const crypto = require('crypto');
const config = require('../../config');
const { getRedis } = require('../redis');

const SEEN_PREFIX = 'hmac:seen:';
const TTL_SEC = Math.max(config.hmacToleranceSeconds * 2, 60);

function seenKey(agentId, timestamp, signatureHex) {
  const h = crypto.createHash('sha256').update(`${agentId}:${timestamp}:${signatureHex}`).digest('hex').slice(0, 32);
  return SEEN_PREFIX + h;
}

/**
 * Check if this (agentId, timestamp, signature) was already used (replay). Returns true if replay (reject).
 */
async function isReplay(agentId, timestamp, signatureHex) {
  const key = seenKey(agentId, timestamp, signatureHex);
  const redis = await getRedis();
  if (redis) {
    const exists = await redis.get(key);
    return !!exists;
  }
  return memorySeen.has(key);
}

/**
 * Mark (agentId, timestamp, signature) as seen after successful verification. Call only once per valid request.
 */
async function markSeen(agentId, timestamp, signatureHex) {
  const key = seenKey(agentId, timestamp, signatureHex);
  const redis = await getRedis();
  if (redis) {
    await redis.setex(key, TTL_SEC, '1');
    return;
  }
  memorySeen.set(key, true);
  setTimeout(() => memorySeen.delete(key), TTL_SEC * 1000);
}

const memorySeen = new Map();

module.exports = {
  isReplay,
  markSeen,
  TTL_SEC,
};
