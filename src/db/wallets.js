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
 * Insert a ledger entry. If client is provided, use it (transaction); otherwise use pool.
 */
async function insertLedgerEntry(client, agentId, coin, type, amountCents, metadata = null) {
  const q = `INSERT INTO ledger_entries (uuid, agent_id, coin, type, amount_cents, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`;
  const params = [uuidv4(), agentId, coin, type, amountCents, metadata ? JSON.stringify(metadata) : null];
  const res = await (client ? client.query(q, params) : query(q, params));
  return res.rows[0].id;
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

module.exports = {
  getBalance,
  ensureWallet,
  insertLedgerEntry,
  transfer,
  debit,
  credit,
};
