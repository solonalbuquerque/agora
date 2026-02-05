'use strict';

const trustLevelsDb = require('../db/trustLevels');

const DEFAULTS = [
  { level: 0, name: 'New', faucet_daily_limit_cents: 5000, max_transfer_per_tx_cents: null, allow_paid_services: false, auto_promotion: { min_calls: 50, min_success_rate_pct: 95, min_account_days: 7 } },
  { level: 1, name: 'Verified', faucet_daily_limit_cents: 10000, max_transfer_per_tx_cents: null, allow_paid_services: true, auto_promotion: { min_calls: 200, min_success_rate_pct: 98, min_account_days: 30 } },
  { level: 2, name: 'Trusted', faucet_daily_limit_cents: 25000, max_transfer_per_tx_cents: null, allow_paid_services: true, auto_promotion: { min_calls: 500, min_success_rate_pct: 99, min_account_days: 90 } },
  { level: 3, name: 'Partner', faucet_daily_limit_cents: 50000, max_transfer_per_tx_cents: null, allow_paid_services: true, auto_promotion: null },
];

let cache = null;

async function loadFromDb() {
  try {
    const rows = await trustLevelsDb.getAll();
    if (rows && rows.length > 0) cache = rows;
  } catch (_) {
    cache = null;
  }
}

function getLevels() {
  return cache && cache.length > 0 ? cache : DEFAULTS;
}

function getLevel(level) {
  const n = Number(level);
  const levels = getLevels();
  if (n < 0 || n >= levels.length) return undefined;
  return levels[n];
}

function getFaucetDailyLimitCents(level) {
  const cfg = getLevel(level);
  return cfg ? cfg.faucet_daily_limit_cents : DEFAULTS[0].faucet_daily_limit_cents;
}

function getMaxTransferPerTxCents(level) {
  const cfg = getLevel(level);
  return cfg ? cfg.max_transfer_per_tx_cents : null;
}

function getAllowPaidServices(level) {
  const cfg = getLevel(level);
  return cfg ? cfg.allow_paid_services : false;
}

function getAutoPromotionRules(fromLevel) {
  const cfg = getLevel(fromLevel);
  return cfg ? cfg.auto_promotion : null;
}

function getMaxTrustLevel() {
  const levels = getLevels();
  return levels.length - 1;
}

function getAllLevels() {
  return getLevels();
}

module.exports = {
  loadFromDb,
  getLevel,
  getFaucetDailyLimitCents,
  getMaxTransferPerTxCents,
  getAllowPaidServices,
  getAutoPromotionRules,
  getMaxTrustLevel: () => getMaxTrustLevel(),
  getAllLevels,
};
