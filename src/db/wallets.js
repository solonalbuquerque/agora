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
 * requestId: optional; for request correlation (B2).
 */
async function insertLedgerEntry(client, agentId, coin, type, amountCents, metadata = null, externalRef = null, requestId = null) {
  const q = `INSERT INTO ledger_entries (uuid, agent_id, coin, type, amount_cents, metadata, external_ref, request_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`;
  const params = [uuidv4(), agentId, coin, type, amountCents, metadata ? JSON.stringify(metadata) : null, externalRef || null, requestId || null];
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
    await insertLedgerEntry(client, fromAgentId, coin, 'debit', amountCents, { ...meta, to_agent_id: toAgentId }, null, null);
    await insertLedgerEntry(client, toAgentId, coin, 'credit', amountCents, { ...meta, from_agent_id: fromAgentId }, null, null);
  });
  return { success: true };
}

/**
 * Debit an agent's balance (e.g. for execution). Call inside a transaction.
 */
async function debit(client, agentId, coin, amountCents, metadata = null, requestId = null) {
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
  await insertLedgerEntry(client, agentId, coin, 'debit', amountCents, metadata, null, requestId);
}

/**
 * Credit an agent's balance (e.g. after execution). Call inside a transaction.
 */
async function credit(client, agentId, coin, amountCents, metadata = null, requestId = null) {
  await ensureWallet(client, agentId, coin);
  await client.query(
    'UPDATE wallets SET balance_cents = balance_cents + $1 WHERE agent_id = $2 AND coin = $3',
    [amountCents, agentId, coin]
  );
  await insertLedgerEntry(client, agentId, coin, 'credit', amountCents, metadata, null, requestId);
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

async function listWallets(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  let where = '1=1';
  const params = [];
  let i = 1;
  if (filters.agent_id) {
    params.push(filters.agent_id);
    where += ` AND agent_id = $${i++}`;
  }
  if (filters.coin) {
    params.push(filters.coin);
    where += ` AND coin = $${i++}`;
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where += ` AND (agent_id ILIKE $${i} OR coin ILIKE $${i})`;
    i++;
  }
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM wallets WHERE ${where}`, params);
  const total = countRes.rows[0]?.total ?? 0;
  params.push(limit, offset);
  const res = await query(
    `SELECT agent_id, coin, balance_cents FROM wallets WHERE ${where} ORDER BY agent_id, coin LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return { rows: res.rows, total };
}

async function listLedger(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  let where = '1=1';
  const params = [];
  let i = 1;
  if (filters.agent_id) {
    params.push(filters.agent_id);
    where += ` AND agent_id = $${i++}`;
  }
  if (filters.coin) {
    params.push(filters.coin);
    where += ` AND coin = $${i++}`;
  }
  if (filters.type) {
    params.push(filters.type);
    where += ` AND type = $${i++}`;
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where += ` AND (agent_id ILIKE $${i} OR uuid::text ILIKE $${i} OR coin ILIKE $${i} OR external_ref ILIKE $${i})`;
    i++;
  }
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM ledger_entries WHERE ${where}`, params);
  const total = countRes.rows[0]?.total ?? 0;
  params.push(limit, offset);
  const res = await query(
    `SELECT id, uuid, agent_id, coin, type, amount_cents, metadata, external_ref, created_at FROM ledger_entries WHERE ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return { rows: res.rows, total };
}

async function getLedgerById(id) {
  const res = await query(
    'SELECT id, uuid, agent_id, coin, type, amount_cents, metadata, external_ref, created_at FROM ledger_entries WHERE id = $1',
    [id]
  );
  return res.rows[0] || null;
}

async function listCoins() {
  const res = await query('SELECT coin, name, qtd_cents, circulating_cents, prefix, suffix, decimals FROM wallets_coins ORDER BY coin');
  return res.rows;
}

async function getCoin(coin) {
  const res = await query('SELECT coin, name, qtd_cents, circulating_cents, prefix, suffix, decimals FROM wallets_coins WHERE coin = $1', [coin]);
  return res.rows[0] || null;
}

async function createCoin(coin, name, qtdCents = 0, prefix = '', suffix = '', decimals = 2) {
  const coinUpper = (coin || '').toString().slice(0, 16).toUpperCase();
  await query(
    'INSERT INTO wallets_coins (coin, name, qtd_cents, prefix, suffix, decimals) VALUES ($1, $2, $3, $4, $5, $6)',
    [coinUpper, name || coinUpper, Number(qtdCents) || 0, prefix || '', suffix || '', Number(decimals) || 2]
  );
  return getCoin(coinUpper);
}

async function updateCoin(coin, data) {
  const updates = [];
  const values = [];
  let i = 1;
  if (data.name !== undefined) {
    updates.push(`name = $${i++}`);
    values.push(data.name);
  }
  if (data.qtd_cents !== undefined) {
    updates.push(`qtd_cents = $${i++}`);
    values.push(Number(data.qtd_cents) || 0);
  }
  if (data.prefix !== undefined) {
    updates.push(`prefix = $${i++}`);
    values.push((data.prefix || '').toString().slice(0, 10));
  }
  if (data.suffix !== undefined) {
    updates.push(`suffix = $${i++}`);
    values.push((data.suffix || '').toString().slice(0, 10));
  }
  if (data.decimals !== undefined) {
    updates.push(`decimals = $${i++}`);
    values.push(Number(data.decimals) || 2);
  }
  if (updates.length === 0) return getCoin(coin);
  values.push(coin);
  await query(`UPDATE wallets_coins SET ${updates.join(', ')} WHERE coin = $${i}`, values);
  return getCoin(coin);
}

async function deleteCoin(coin) {
  const res = await query('DELETE FROM wallets_coins WHERE coin = $1 RETURNING coin', [coin]);
  return res.rowCount > 0;
}

/**
 * Rebalance: calculate circulating amount for all coins based on wallet balances
 */
async function rebalanceCoins() {
  // Get sum of balances per coin
  const res = await query(`
    UPDATE wallets_coins wc
    SET circulating_cents = COALESCE((
      SELECT SUM(w.balance_cents) 
      FROM wallets w 
      WHERE w.coin = wc.coin
    ), 0)
    RETURNING coin, circulating_cents
  `);
  return res.rows;
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
  listWallets,
  listLedger,
  getLedgerById,
  listCoins,
  getCoin,
  createCoin,
  updateCoin,
  deleteCoin,
  rebalanceCoins,
};
