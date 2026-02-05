'use strict';

const config = require('../config');
const { query, withTransaction } = require('../db/index');
const walletsDb = require('../db/wallets');
const { created } = require('../lib/responses');
const { badRequest, forbidden } = require('../lib/errors');
const { incrRateLimit } = require('../lib/redis');

const FAUCET_DAILY_LIMIT_CENTS = 5000;
const FAUCET_WINDOW_SEC = 86400; // 1 day
const FAUCET_PER_AGENT_KEY = 'faucet:agent:';
const FAUCET_PER_IP_KEY = 'faucet:ip:';

async function faucetRoutes(fastify) {
  fastify.post('/faucet', {
    schema: {
      tags: ['Faucet'],
      description: 'Request test balance (only when ENABLE_FAUCET=true). Rate limited by agent and IP.',
      body: {
        type: 'object',
        required: ['agent_id', 'amount_cents'],
        properties: {
          agent_id: { type: 'string' },
          amount_cents: { type: 'integer', minimum: 1, maximum: 1000 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                agent_id: { type: 'string' },
                amount_cents: { type: 'integer' },
                coin: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!config.enableFaucet) {
      return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Faucet not enabled' });
    }
    const { agent_id: agentId, amount_cents: amountCents } = request.body || {};
    if (!agentId || amountCents == null || amountCents < 1) {
      return badRequest(reply, 'agent_id and amount_cents (1–1000) are required');
    }
    if (amountCents > 1000) return badRequest(reply, 'amount_cents max 1000 per request');
    // Verificar se o agent existe antes de tentar criar a wallet
    const agentCheck = await query('SELECT id FROM agents WHERE id = $1', [agentId]);
    if (agentCheck.rows.length === 0) {
      return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: `Agent ${agentId} not found` });
    }
    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const agentKey = FAUCET_PER_AGENT_KEY + agentId;
    const ipKey = FAUCET_PER_IP_KEY + ip;
    const [agentLimit, ipLimit] = await Promise.all([
      incrRateLimit(agentKey, FAUCET_WINDOW_SEC, Math.ceil(FAUCET_DAILY_LIMIT_CENTS / 100)),
      incrRateLimit(ipKey, FAUCET_WINDOW_SEC, 50),
    ]);
    if (agentLimit.over) return reply.code(429).send({ ok: false, code: 'RATE_LIMIT', message: 'Daily faucet limit per agent exceeded' });
    if (ipLimit.over) return reply.code(429).send({ ok: false, code: 'RATE_LIMIT', message: 'Daily faucet limit per IP exceeded' });
    const coin = config.defaultCoin || 'AGOTEST';
    await withTransaction(async (client) => {
      await walletsDb.ensureCoin(client, coin);
      await walletsDb.ensureWallet(client, agentId, coin);
      await client.query(
        'UPDATE wallets SET balance_cents = balance_cents + $1 WHERE agent_id = $2 AND coin = $3',
        [amountCents, agentId, coin]
      );
      await walletsDb.insertLedgerEntry(client, agentId, coin, 'credit', amountCents, { faucet: true }, null);
    });
    return created(reply, { agent_id: agentId, amount_cents: amountCents, coin });
  });
}

module.exports = faucetRoutes;
