'use strict';

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const { agentId } = require('../src/lib/ids');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://agora:agora@localhost:5432/agora',
});

async function seed() {
  const client = await pool.connect();
  try {
    // Ensure USD coin exists in wallets_coins
    await client.query(
      `INSERT INTO wallets_coins (coin, name, qtd_cents) VALUES ('USD', 'US Dollar', 0)
       ON CONFLICT (coin) DO NOTHING`
    );

    // Optionally create two test agents with initial balance (only if no agents exist yet)
    const countRes = await client.query('SELECT COUNT(*) AS c FROM agents');
    const count = parseInt(countRes.rows[0].c, 10);
    if (count === 0) {
      const id1 = agentId();
      const id2 = agentId();
      const secret1 = crypto.randomBytes(32).toString('hex');
      const secret2 = crypto.randomBytes(32).toString('hex');
      await client.query(
        `INSERT INTO agents (id, name, secret, status, trust_level) VALUES ($1, 'Test Agent A', $2, 'active', 0), ($3, 'Test Agent B', $4, 'active', 0)`,
        [id1, secret1, id2, secret2]
      );
      await client.query(
        `INSERT INTO wallets (agent_id, coin, balance_cents) VALUES ($1, 'USD', 10000), ($2, 'USD', 10000)
         ON CONFLICT (agent_id, coin) DO UPDATE SET balance_cents = 10000`,
        [id1, id2]
      );
      await client.query(
        `INSERT INTO ledger_entries (uuid, agent_id, coin, type, amount_cents, metadata)
         VALUES ($1, $2, 'USD', 'credit', 10000, '{"seed": true}'), ($3, $4, 'USD', 'credit', 10000, '{"seed": true}')`,
        [uuidv4(), id1, uuidv4(), id2]
      );
      console.log('Created test agents:', id1, id2);
      console.log('Secrets (store securely):', secret1.slice(0, 8) + '...', secret2.slice(0, 8) + '...');
    } else {
      console.log('Agents already exist, skipping test agent creation.');
    }
    console.log('Seed done.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
