'use strict';

const { query, withTransaction } = require('./index');
const { v4: uuidv4 } = require('uuid');

async function getBalance(agentId, coin) {
  const res = await query(
    'SELECT balance_cents FROM wallets WHERE agent_id = $1 AND coin = $2',
    [agentId, coin]
  );
  return res.rows[0] ? Number(res.rows[0].balance_cents) : 0;
}

/**
 * Ensure a wallet row exists for agent/coin (e.g. after first credit).
 */
async function ensureWallet(client, agentId, coin) {
  await client.query(
    `INSERT INTO wallets (agent_id, coin, balance_cents)
     VALUES ($1, $2, 0)
     ON CONFLICT (agent_id, coin) DO NOTHING`,
    [agentId, coin]
  );
}

/**
 * Ensure coin exists in wallets_coins (for admin/issuer mint). Call before credit if coin may be new.
 * client: optional; if provided, runs in same transaction.
 */
async function ensureCoin(client, coin) {
  const sql = `INSERT INTO wallets_coins (coin, name, qtd_cents) VALUES ($1, $2, 0) ON CONFLICT (coin) DO NOTHING`;
  if (client) {
    await client.query(sql, [coin, coin]);
  } else {
    await query(sql, [coin, coin]);
  }
}

/**
 * Insert a ledger entry. If client is provided, use it (transaction); otherwise use pool.
 * externalRef: optional; when set, idempotency is enforced (unique coin+external_ref).
 */
async function insertLedgerEntry(client, agentId, coin, type, amountCents, metadata = null, externalRef = null) {
  const q = `INSERT INTO ledger_entries (uuid, agent_id, coin, type, amount_cents, metadata, external_ref)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`;
  const params = [uuidv4(), agentId, coin, type, amountCents, metadata ? JSON.stringify(metadata) : null, externalRef || null];
  const res = await (client ? client.query(q, params) : query(q, params));
  return res.rows[0].id;
}

/**
 * Check if a ledger entry already exists for (coin, external_ref). For idempotent mint/issuer credit.
 */
async function existsLedgerByExternalRef(client, coin, externalRef) {
  const q = 'SELECT 1 FROM ledger_entries WHERE coin = $1 AND external_ref = $2 LIMIT 1';
  const res = await (client ? client.query(q, [coin, externalRef]) : query(q, [coin, externalRef]));
  return res.rows.length > 0;
}

/**
 * Transfer amount_cents from one agent to another in one transaction.
 * Creates ledger entries for both debit and credit.
 * Returns { success: true } or throws.
 */
async function transfer(fromAgentId, toAgentId, coin, amountCents, metadata = null) {
  if (amountCents <= 0) {
    const err = new Error('Amount must be positive');
    err.code = 'BAD_AMOUNT';
    throw err;
  }
  await withTransaction(async (client) => {
    const balanceRes = await client.query(
      'SELECT balance_cents FROM wallets WHERE agent_id = $1 AND coin = $2 FOR UPDATE',
      [fromAgentId, coin]
    );
    const fromBalance = balanceRes.rows[0] ? Number(balanceRes.rows[0].balance_cents) : 0;
    if (fromBalance < amountCents) {
      const err = new Error('Insufficient balance');
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }
    await ensureWallet(client, fromAgentId, coin);
    await ensureWallet(client, toAgentId, coin);
    await client.query(
      'UPDATE wallets SET balance_cents = balance_cents - $1 WHERE agent_id = $2 AND coin = $3',
      [amountCents, fromAgentId, coin]
    );
    await client.query(
      'UPDATE wallets SET balance_cents = balance_cents + $1 WHERE agent_id = $2 AND coin = $3',
      [amountCents, toAgentId, coin]
    );
    const meta = metadata || {};
    await insertLedgerEntry(client, fromAgentId, coin, 'debit', amountCents, { ...meta, to_agent_id: toAgentId });
    await insertLedgerEntry(client, toAgentId, coin, 'credit', amountCents, { ...meta, from_agent_id: fromAgentId });
  });
  return { success: true };
}

/**
 * Debit an agent's balance (e.g. for execution). Call inside a transaction.
 */
async function debit(client, agentId, coin, amountCents, metadata = null) {
  await ensureWallet(client, agentId, coin);
  const res = await client.query(
    'UPDATE wallets SET balance_cents = balance_cents - $1 WHERE agent_id = $2 AND coin = $3 RETURNING balance_cents',
    [amountCents, agentId, coin]
  );
  if (res.rows[0] && Number(res.rows[0].balance_cents) < 0) {
    const err = new Error('Insufficient balance');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }
  await insertLedgerEntry(client, agentId, coin, 'debit', amountCents, metadata);
}

/**
 * Credit an agent's balance (e.g. after execution). Call inside a transaction.
 */
async function credit(client, agentId, coin, amountCents, metadata = null) {
  await ensureWallet(client, agentId, coin);
  await client.query(
    'UPDATE wallets SET balance_cents = balance_cents + $1 WHERE agent_id = $2 AND coin = $3',
    [amountCents, agentId, coin]
  );
  await insertLedgerEntry(client, agentId, coin, 'credit', amountCents, metadata);
}

/**
 * List ledger entries (statement) for an agent/coin with optional filters.
 * filters: { type, from_date, to_date, limit, offset }
 * - type: 'credit' | 'debit' (opcional)
 * - from_date, to_date: YYYY-MM-DD (inclusive)
 * Returns { rows, total }.
 */
async function getStatement(agentId, coin, filters = {}) {
  const { type, from_date, to_date, limit = 20, offset = 0 } = filters;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  let where = 'agent_id = $1 AND coin = $2';
  const params = [agentId, coin];
  let i = 3;
  if (type) {
    params.push(type);
    where += ` AND type = $${i++}`;
  }
  if (from_date) {
    params.push(from_date);
    where += ` AND created_at >= $${i}::date`;
    i += 1;
  }
  if (to_date) {
    params.push(to_date);
    where += ` AND created_at < ($${i}::date + interval '1 day')`;
    i += 1;
  }

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM ledger_entries WHERE ${where}`,
    params
  );
  const total = countRes.rows[0]?.total ?? 0;

  params.push(safeLimit, safeOffset);
  const res = await query(
    `SELECT id, uuid, type, amount_cents, metadata, created_at
     FROM ledger_entries WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return { rows: res.rows, total };
}

module.exports = {
  getBalance,
  ensureWallet,
  ensureCoin,
  insertLedgerEntry,
  existsLedgerByExternalRef,
  transfer,
  debit,
  credit,
  getStatement,
};
