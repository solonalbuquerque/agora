'use strict';

const config = require('../../config');
const { getRedis } = require('../redis');

const FAILS_KEY_PREFIX = 'cb:fails:';
const THRESHOLD = config.serviceCbFails;
const WINDOW_TTL_SEC = 3600; // keep failure count for 1 hour

async function getRedisClient() {
  return getRedis();
}

/**
 * Record a webhook failure for the service. Returns { count, opened }.
 * When opened is true, caller should set service.status = 'paused' and log.
 */
async function recordFailure(serviceId) {
  const redis = await getRedisClient();
  const key = FAILS_KEY_PREFIX + serviceId;
  let count;
  if (redis) {
    count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_TTL_SEC);
  } else {
    count = memoryIncr(key);
  }
  return { count, opened: count >= THRESHOLD };
}

/**
 * Record success: reset failure count for the service.
 */
async function recordSuccess(serviceId) {
  const redis = await getRedisClient();
  const key = FAILS_KEY_PREFIX + serviceId;
  if (redis) {
    await redis.del(key);
  } else {
    memoryDelete(key);
  }
}

const memoryCbStore = new Map();

function memoryIncr(key) {
  const v = (memoryCbStore.get(key) || 0) + 1;
  memoryCbStore.set(key, v);
  setTimeout(() => memoryCbStore.delete(key), WINDOW_TTL_SEC * 1000);
  return v;
}

function memoryDelete(key) {
  memoryCbStore.delete(key);
}

module.exports = {
  recordFailure,
  recordSuccess,
  THRESHOLD,
};
