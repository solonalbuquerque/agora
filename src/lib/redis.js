'use strict';

const config = require('../config');

let redisClient = null;

async function getRedis() {
  if (!config.redisUrl) return null;
  if (redisClient) return redisClient;
  try {
    const Redis = require('ioredis');
    redisClient = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });
    redisClient.on('error', () => {});
    return redisClient;
  } catch (_) {
    return null;
  }
}

const memoryStore = new Map();
const MEMORY_TTL_MS = 5 * 60 * 1000;

function memorySet(key, value, ttlMs = MEMORY_TTL_MS) {
  memoryStore.set(key, value);
  setTimeout(() => memoryStore.delete(key), ttlMs);
}

function memoryGet(key) {
  return memoryStore.get(key);
}

function memoryDelete(key) {
  memoryStore.delete(key);
}

async function setNonce(key, nonce, ttlSeconds = 300) {
  const redis = await getRedis();
  if (redis) {
    await redis.setex(key, ttlSeconds, nonce);
    return;
  }
  memorySet(key, nonce, ttlSeconds * 1000);
}

async function getAndDelNonce(key) {
  const redis = await getRedis();
  if (redis) {
    const val = await redis.get(key);
    if (val) await redis.del(key);
    return val;
  }
  const val = memoryGet(key);
  memoryDelete(key);
  return val;
}

async function incrRateLimit(key, windowSeconds, limit) {
  const redis = await getRedis();
  if (!redis) return { current: 0, over: false };
  const k = `ratelimit:${key}`;
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, windowSeconds);
  return { current: count, over: count > limit };
}

module.exports = {
  getRedis,
  setNonce,
  getAndDelNonce,
  incrRateLimit,
};
