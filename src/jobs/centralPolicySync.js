'use strict';

/**
 * Syncs this instance's trust policy from Central (GET /instances/me/policy).
 * Persists to instance_central_policy for use by export, execute, and staff UI.
 */

const config = require('../config');
const centralClient = require('../lib/centralClient');
const logger = require('../lib/logger');
const instanceCentralPolicyDb = require('../db/instanceCentralPolicy');
const { v4: uuidv4 } = require('uuid');

const SYNC_INTERVAL_MS = Number(process.env.CENTRAL_POLICY_SYNC_MS) || 300_000; // 5 min

async function syncOnce() {
  const baseUrl = config.agoraCenterUrl;
  const instanceId = config.instanceId;
  const instanceToken = config.instanceToken;

  if (!baseUrl || !instanceId || !instanceToken) return;

  const requestId = `central-policy-sync-${uuidv4()}`;
  try {
    const data = await centralClient.getCentralPolicy(baseUrl, instanceId, instanceToken, requestId);
    await instanceCentralPolicyDb.upsert(instanceId, {
      trust_level: data.trust_level,
      visibility_status: data.visibility_status,
      policy: data.policy || {},
    });
    logger.log('info', 'Central policy sync ok', { request_id: requestId, trust_level: data.trust_level });
  } catch (err) {
    logger.log('warn', 'Central policy sync failed', { request_id: requestId, error: err.message, code: err?.code });
  }
}

function start() {
  if (!config.agoraCenterUrl || !config.instanceId || !config.instanceToken) {
    logger.log('info', 'Central policy sync skipped: AGORA_CENTER_URL, INSTANCE_ID and INSTANCE_TOKEN required');
    return;
  }
  logger.log('info', 'Central policy sync started', { instance_id: config.instanceId, interval_ms: SYNC_INTERVAL_MS });
  const run = () => {
    syncOnce().catch((err) => logger.log('error', 'Central policy sync error', { error: err.message }));
  };
  run();
  setInterval(run, SYNC_INTERVAL_MS);
}

module.exports = {
  syncOnce,
  start,
};
