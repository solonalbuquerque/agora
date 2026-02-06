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
  if (!redis) {
    return memoryIncrRateLimit(key, windowSeconds, limit);
  }
  const k = `ratelimit:${key}`;
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, windowSeconds);
  const ttl = await redis.ttl(k);
  const resetAt = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : windowSeconds);
  return { current: count, over: count > limit, limit, resetAt };
}

const memoryRateLimitStore = new Map();

function memoryIncrRateLimit(key, windowSeconds, limit) {
  const k = `ratelimit:${key}`;
  const now = Date.now();
  let entry = memoryRateLimitStore.get(k);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowSeconds * 1000 };
    memoryRateLimitStore.set(k, entry);
  }
  entry.count += 1;
  const resetAtSec = Math.ceil(entry.resetAt / 1000);
  return {
    current: entry.count,
    over: entry.count > limit,
    limit,
    resetAt: resetAtSec,
  };
}

module.exports = {
  getRedis,
  setNonce,
  getAndDelNonce,
  incrRateLimit,
};
