'use strict';

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const { agentId } = require('../src/lib/ids');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://agora:agora@localhost:5432/agora',
});

const DEFAULT_COIN = 'AGOTEST';

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO wallets_coins (coin, name, qtd_cents) VALUES ($1, 'AGORA Test Coin', 0)
       ON CONFLICT (coin) DO NOTHING`,
      [DEFAULT_COIN]
    );

    let id1; let id2; let secret1; let secret2;
    const countRes = await client.query('SELECT COUNT(*) AS c FROM agents');
    const count = parseInt(countRes.rows[0].c, 10);
    if (count === 0) {
      id1 = agentId();
      id2 = agentId();
      secret1 = crypto.randomBytes(32).toString('hex');
      secret2 = crypto.randomBytes(32).toString('hex');
      await client.query(
        `INSERT INTO agents (id, name, secret, status, trust_level) VALUES ($1, 'Test Agent A', $2, 'active', 0), ($3, 'Test Agent B', $4, 'active', 0)`,
        [id1, secret1, id2, secret2]
      );
      await client.query(
        `INSERT INTO wallets (agent_id, coin, balance_cents) VALUES ($1, $2, 10000), ($3, $2, 10000)
         ON CONFLICT (agent_id, coin) DO UPDATE SET balance_cents = 10000`,
        [id1, DEFAULT_COIN, id2]
      );
      await client.query(
        `INSERT INTO ledger_entries (uuid, agent_id, coin, type, amount_cents, metadata)
         VALUES ($1, $2, $3, 'credit', 10000, '{"seed": true}'), ($4, $5, $3, 'credit', 10000, '{"seed": true}')`,
        [uuidv4(), id1, DEFAULT_COIN, uuidv4(), id2]
      );
      console.log('Created test agents:', id1, id2);
      console.log('Secrets (store securely):', secret1.slice(0, 8) + '...', secret2.slice(0, 8) + '...');
    } else {
      const agents = await client.query('SELECT id FROM agents LIMIT 2');
      id1 = agents.rows[0]?.id;
      id2 = agents.rows[1]?.id;
    }

    if (id1 && id2) {
      const humanCount = await client.query('SELECT COUNT(*) AS c FROM humans');
      if (parseInt(humanCount.rows[0].c, 10) === 0) {
        const humanId = uuidv4();
        await client.query(
          `INSERT INTO humans (id, email, status, verified_at) VALUES ($1, 'dev@agora.local', 'verified', NOW())`,
          [humanId]
        );
        await client.query(
          `INSERT INTO human_agents (human_id, agent_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'owner')
           ON CONFLICT (human_id, agent_id) DO NOTHING`,
          [humanId, id1, id2]
        );
        console.log('Created dev human:', humanId, '(dev@agora.local) linked to 2 agents');
      }
    }

    const issuerCount = await client.query('SELECT COUNT(*) AS c FROM issuers');
    if (parseInt(issuerCount.rows[0].c, 10) === 0) {
      const issuerId = uuidv4();
      const issuerSecret = crypto.randomBytes(32).toString('hex');
      await client.query(
        `INSERT INTO issuers (id, name, status, secret) VALUES ($1, 'Test Issuer', 'active', $2)`,
        [issuerId, issuerSecret]
      );
      console.log('Created test issuer:', issuerId);
      console.log('Issuer secret (for /issuer/credit):', issuerSecret.slice(0, 8) + '...');
    }

    const instanceCount = await client.query('SELECT COUNT(*) AS c FROM instance');
    if (parseInt(instanceCount.rows[0].c, 10) === 0) {
      const instanceId = uuidv4();
      const activationToken = 'dev-instance-token-' + crypto.randomBytes(8).toString('hex');
      const activationTokenHash = hashToken(activationToken);
      await client.query(
        `INSERT INTO instance (id, name, owner_email, status, registered_at, activation_token_hash)
         VALUES ($1, 'Dev Instance', 'admin@agora.local', 'registered', NOW(), $2)`,
        [instanceId, activationTokenHash]
      );
      console.log('Created dev instance:', instanceId);
      console.log('Instance activation token (X-Instance-Token):', activationToken);
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
