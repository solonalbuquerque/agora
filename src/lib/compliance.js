'use strict';

const config = require('../config');
const instanceDb = require('../db/instance');
const staffSettingsDb = require('../db/staffSettings');

const RESERVED_COIN = config.reservedCoin || 'AGO';
const COMPLIANT_STATUS = 'registered';

/**
 * Get the current instance (this deployment). Uses config.instanceId if set, else first instance by id.
 */
async function getCurrentInstance() {
  if (config.instanceId) {
    return instanceDb.getById(config.instanceId);
  }
  const { query } = require('../db/index');
  const res = await query('SELECT id, name, owner_email, status, created_at, registered_at, last_seen_at, official_issuer_id FROM instance ORDER BY created_at ASC LIMIT 1', []);
  return res.rows[0] || null;
}

/**
 * True only if instance.status === 'registered'. flagged/blocked/unregistered/pending => not compliant.
 */
async function isInstanceCompliant() {
  const inst = await getCurrentInstance();
  return inst ? inst.status === COMPLIANT_STATUS : false;
}

/**
 * Throws (reply) if instance is not compliant. Use for AGO inbound (issuer credit).
 * @param {object} reply - Fastify reply
 * @returns {Promise<boolean>} true if compliant
 */
async function requireCompliantForAgoInbound(reply) {
  const compliant = await isInstanceCompliant();
  if (!compliant) {
    reply.code(403).send({
      ok: false,
      code: 'INSTANCE_NOT_COMPLIANT',
      message: 'AGO inbound is disabled until the instance is compliant.',
    });
    return false;
  }
  return true;
}

/**
 * Throws (reply) if instance is not compliant. Use for AGO outbound (bridge).
 */
async function requireCompliantForAgoOutbound(reply) {
  const compliant = await isInstanceCompliant();
  if (!compliant) {
    reply.code(403).send({
      ok: false,
      code: 'INSTANCE_NOT_COMPLIANT',
      message: 'AGO outbound is disabled until the instance is compliant.',
    });
    return false;
  }
  return true;
}

/**
 * For exportable services: must be compliant and export_services_enabled.
 */
async function requireCompliantForExports(reply) {
  const compliant = await isInstanceCompliant();
  if (!compliant) {
    reply.code(403).send({
      ok: false,
      code: 'INSTANCE_NOT_COMPLIANT',
      message: 'Service export is disabled until the instance is compliant.',
    });
    return false;
  }
  const enabled = await staffSettingsDb.get('export_services_enabled');
  if (enabled !== 'true') {
    reply.code(403).send({
      ok: false,
      code: 'EXPORTS_DISABLED',
      message: 'Service export is disabled by settings.',
    });
    return false;
  }
  return true;
}

function isReservedCoin(coin) {
  return (coin || '').toString().toUpperCase() === RESERVED_COIN;
}

module.exports = {
  RESERVED_COIN,
  getCurrentInstance,
  isInstanceCompliant,
  requireCompliantForAgoInbound,
  requireCompliantForAgoOutbound,
  requireCompliantForExports,
  isReservedCoin,
};
