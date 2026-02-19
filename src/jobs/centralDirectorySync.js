'use strict';

/**
 * Syncs exported services to the Central directory. Builds payload with price_ago_cents
 * (and optionally price_alt_coin / price_alt_cents) and POSTs to Central.
 * Requires AGORA_CENTER_URL, INSTANCE_ID and INSTANCE_TOKEN (or AGORA_INSTANCE_TOKEN).
 */

const config = require('../config');
const { getInstanceConfig } = require('../lib/runtimeInstanceConfig');
const centralClient = require('../lib/centralClient');
const logger = require('../lib/logger');
const servicesDb = require('../db/services');
const { v4: uuidv4 } = require('uuid');

const SYNC_INTERVAL_MS = Number(process.env.CENTRAL_DIRECTORY_SYNC_MS) || 60_000;

function mapServiceToCentral(service) {
  const reservedCoin = (config.reservedCoin || 'AGO').toString();
  const coin = (service.coin || '').toString();
  const priceCents = Math.max(0, parseInt(service.price_cents, 10) || 0);
  const priceAgoCents = coin.toUpperCase() === reservedCoin.toUpperCase() ? priceCents : 0;
  const payload = {
    service_ref: service.id,
    service_slug: service.slug || null,
    name: service.name || null,
    description: service.description || null,
    webhook_url: service.webhook_url || null,
    metadata: {},
    price_ago_cents: priceAgoCents,
  };
  if (coin && coin.toUpperCase() !== reservedCoin.toUpperCase()) {
    payload.price_alt_coin = coin.slice(0, 16);
    payload.price_alt_cents = priceCents;
  }
  return payload;
}

async function syncOnce() {
  const baseUrl = config.agoraCenterUrl;
  const { instanceId, instanceToken } = await getInstanceConfig();

  if (!baseUrl || !instanceId || !instanceToken) return;

  const requestId = `central-dir-sync-${uuidv4()}`;
  const instanceCentralPolicyDb = require('../db/instanceCentralPolicy');
  const centralPolicy = await instanceCentralPolicyDb.get(instanceId);

  const { rows } = await servicesDb.list({
    status: 'active',
    visibility: 'exported',
    export_status: 'active',
    limit: 200,
    offset: 0,
  });
  let services = (rows || []).map(mapServiceToCentral);
  if (centralPolicy?.policy && centralPolicy.policy.allow_paid_services_export === false) {
    services = services.filter((s) => (Number(s.price_ago_cents) || 0) === 0);
  }
  if (services.length === 0) return;

  try {
    await centralClient.postExportedServices(baseUrl, instanceId, instanceToken, services, requestId);
    logger.log('info', 'Central directory sync ok', { request_id: requestId, count: services.length });
  } catch (err) {
    logger.log('warn', 'Central directory sync failed', { request_id: requestId, error: err.message, code: err?.code });
  }
}

function start() {
  if (!config.agoraCenterUrl) return;
  logger.log('info', 'Central directory sync started (runs when instance is registered)', { interval_ms: SYNC_INTERVAL_MS });
  const run = () => {
    syncOnce().catch((err) => logger.log('error', 'Central directory sync error', { error: err.message }));
  };
  run();
  setInterval(run, SYNC_INTERVAL_MS);
}

module.exports = {
  syncOnce,
  start,
  mapServiceToCentral,
};
