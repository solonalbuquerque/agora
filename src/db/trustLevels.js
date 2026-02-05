'use strict';

const { query } = require('./index');

async function getAll() {
  const res = await query(
    `SELECT level, name, faucet_daily_limit_cents, max_transfer_per_tx_cents, allow_paid_services,
            auto_rule_min_calls, auto_rule_min_success_rate_pct, auto_rule_min_account_days, updated_at
     FROM trust_levels ORDER BY level`
  );
  return res.rows.map((row) => ({
    level: row.level,
    name: row.name,
    faucet_daily_limit_cents: row.faucet_daily_limit_cents,
    max_transfer_per_tx_cents: row.max_transfer_per_tx_cents != null ? row.max_transfer_per_tx_cents : null,
    allow_paid_services: row.allow_paid_services,
    auto_promotion:
      row.auto_rule_min_calls != null || row.auto_rule_min_success_rate_pct != null || row.auto_rule_min_account_days != null
        ? {
            min_calls: row.auto_rule_min_calls,
            min_success_rate_pct: row.auto_rule_min_success_rate_pct != null ? Number(row.auto_rule_min_success_rate_pct) : null,
            min_account_days: row.auto_rule_min_account_days,
          }
        : null,
    updated_at: row.updated_at,
  }));
}

async function getByLevel(level) {
  const res = await query(
    `SELECT level, name, faucet_daily_limit_cents, max_transfer_per_tx_cents, allow_paid_services,
            auto_rule_min_calls, auto_rule_min_success_rate_pct, auto_rule_min_account_days
     FROM trust_levels WHERE level = $1`,
    [level]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    level: row.level,
    name: row.name,
    faucet_daily_limit_cents: row.faucet_daily_limit_cents,
    max_transfer_per_tx_cents: row.max_transfer_per_tx_cents != null ? row.max_transfer_per_tx_cents : null,
    allow_paid_services: row.allow_paid_services,
    auto_promotion:
      row.auto_rule_min_calls != null || row.auto_rule_min_success_rate_pct != null || row.auto_rule_min_account_days != null
        ? {
            min_calls: row.auto_rule_min_calls,
            min_success_rate_pct: row.auto_rule_min_success_rate_pct != null ? Number(row.auto_rule_min_success_rate_pct) : null,
            min_account_days: row.auto_rule_min_account_days,
          }
        : null,
  };
}

async function update(level, data) {
  const updates = [];
  const params = [];
  let i = 1;
  if (data.name !== undefined) {
    params.push(data.name);
    updates.push(`name = $${i++}`);
  }
  if (data.faucet_daily_limit_cents !== undefined) {
    params.push(data.faucet_daily_limit_cents);
    updates.push(`faucet_daily_limit_cents = $${i++}`);
  }
  if (data.max_transfer_per_tx_cents !== undefined) {
    params.push(data.max_transfer_per_tx_cents);
    updates.push(`max_transfer_per_tx_cents = $${i++}`);
  }
  if (data.allow_paid_services !== undefined) {
    params.push(data.allow_paid_services);
    updates.push(`allow_paid_services = $${i++}`);
  }
  if (data.auto_rule_min_calls !== undefined) {
    params.push(data.auto_rule_min_calls);
    updates.push(`auto_rule_min_calls = $${i++}`);
  }
  if (data.auto_rule_min_success_rate_pct !== undefined) {
    params.push(data.auto_rule_min_success_rate_pct);
    updates.push(`auto_rule_min_success_rate_pct = $${i++}`);
  }
  if (data.auto_rule_min_account_days !== undefined) {
    params.push(data.auto_rule_min_account_days);
    updates.push(`auto_rule_min_account_days = $${i++}`);
  }
  if (updates.length === 0) return getByLevel(level);
  params.push(level);
  await query(
    `UPDATE trust_levels SET ${updates.join(', ')}, updated_at = NOW() WHERE level = $${i}`,
    params
  );
  return getByLevel(level);
}

module.exports = {
  getAll,
  getByLevel,
  update,
};
