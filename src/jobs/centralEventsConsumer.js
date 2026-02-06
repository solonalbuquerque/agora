'use strict';

/**
 * Polls Central for instance events (INSTANCE_CREDIT, CREDIT_INSTANCE). When payload
 * contains to_agent_ref, credits the agent with AGO (idempotent by external_ref) and acks the event.
 * Requires AGORA_CENTER_URL, INSTANCE_ID and INSTANCE_TOKEN (or AGORA_INSTANCE_TOKEN).
 */

const config = require('../config');
const centralClient = require('../lib/centralClient');
const logger = require('../lib/logger');
const { withTransaction } = require('../db/index');
const walletsDb = require('../db/wallets');
const { v4: uuidv4 } = require('uuid');

const POLL_INTERVAL_MS = Number(process.env.CENTRAL_EVENTS_POLL_MS) || 30_000;
const CREDIT_EVENT_TYPES = new Set(['INSTANCE_CREDIT', 'CREDIT_INSTANCE']);

/** In-memory set of event ids we've already processed (avoid double process in same run). After restart we rely on external_ref idempotency. */
const processedEventIds = new Set();

/**
 * Process one event: if type is INSTANCE_CREDIT/CREDIT_INSTANCE and payload has to_agent_ref,
 * credit the agent (AGO) idempotently by external_ref. Always ack the event so Central can consider it processed.
 * @returns {Promise<boolean>} true if event was handled (credited and/or acked)
 */
async function processEvent(instanceId, instanceToken, event, requestId) {
  const { id: eventId, type, payload } = event;
  if (!CREDIT_EVENT_TYPES.has(type)) return false;
  const p = payload && typeof payload === 'object' ? payload : {};
  const toAgentRef = p.to_agent_ref != null ? String(p.to_agent_ref).trim() : null;

  if (toAgentRef) {
    const amountCents = Math.floor(Number(p.amount_cents)) || 0;
    const externalRef = p.external_ref != null ? String(p.external_ref) : `central-${eventId}`;
    if (amountCents >= 1) {
      const coin = config.reservedCoin || 'AGO';
      await withTransaction(async (client) => {
        const exists = await walletsDb.existsLedgerByExternalRef(client, coin, externalRef);
        if (exists) return;
        await walletsDb.ensureCoin(client, coin);
        await walletsDb.credit(client, toAgentRef, coin, amountCents, { external_ref: externalRef, source: 'central' }, requestId, externalRef);
      });
    }
  }

  await centralClient.ackCentralEvent(config.agoraCenterUrl, instanceId, instanceToken, eventId, requestId);
  return true;
}

/**
 * One poll cycle: fetch events, process those with to_agent_ref, ack processed.
 */
async function pollOnce() {
  const baseUrl = config.agoraCenterUrl;
  const instanceId = config.instanceId;
  const instanceToken = config.instanceToken;

  if (!baseUrl || !instanceId || !instanceToken) {
    return;
  }

  const requestId = `central-events-${uuidv4()}`;
  let data;
  try {
    data = await centralClient.getCentralEvents(baseUrl, instanceId, instanceToken, { limit: 100 }, requestId);
  } catch (err) {
    logger.log('warn', 'Central events fetch failed', { request_id: requestId, error: err.message, code: err?.code });
    return;
  }

  const events = Array.isArray(data?.events) ? data.events : [];
  for (const event of events) {
    if (!event?.id) continue;
    if (processedEventIds.has(event.id)) continue;
    try {
      const processed = await processEvent(instanceId, instanceToken, event, requestId);
      if (processed) processedEventIds.add(event.id);
    } catch (err) {
      logger.log('error', 'Central event process failed', { request_id: requestId, event_id: event.id, error: err.message });
    }
  }
}

/**
 * Run the consumer loop (poll every POLL_INTERVAL_MS). Call from a worker process or setInterval.
 */
function start() {
  if (!config.agoraCenterUrl || !config.instanceId || !config.instanceToken) {
    logger.log('info', 'Central events consumer skipped: AGORA_CENTER_URL, INSTANCE_ID and INSTANCE_TOKEN required');
    return;
  }
  logger.log('info', 'Central events consumer started', { instance_id: config.instanceId, poll_ms: POLL_INTERVAL_MS });
  const run = () => {
    pollOnce().catch((err) => logger.log('error', 'Central events poll error', { error: err.message }));
  };
  run();
  setInterval(run, POLL_INTERVAL_MS);
}

module.exports = {
  pollOnce,
  start,
};
