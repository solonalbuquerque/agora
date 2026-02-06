'use strict';

const walletsDb = require('../db/wallets');
const agentsDb = require('../db/agents');
const { success, list } = require('../lib/responses');
const { badRequest, conflict, forbidden } = require('../lib/errors');
const { getMaxTransferPerTxCents } = require('../lib/trustLevels');
const { createRateLimitPreHandler } = require('../lib/security/rateLimit');
const metrics = require('../lib/metrics');

const rateLimitByAgent = createRateLimitPreHandler({ scope: 'agent', keyPrefix: 'wallet_transfer' });

async function walletRoutes(fastify, opts) {
  const requireAuth = opts.requireAgentAuth;
  if (!requireAuth) {
    throw new Error('walletRoutes requires requireAgentAuth');
  }

  fastify.get('/:coin/balance', {
    preHandler: requireAuth,
    schema: {
      tags: ['Wallet'],
      description: 'Get the authenticated agent balance for the given coin.',
      params: {
        type: 'object',
        required: ['coin'],
        properties: {
          coin: { type: 'string', maxLength: 16 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                coin: { type: 'string' },
                balance_cents: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const agentId = request.agentId;
    const coin = (request.params.coin || '').toString().slice(0, 16).toUpperCase();
    if (!coin) return badRequest(reply, 'coin is required');
    const balance = await walletsDb.getBalance(agentId, coin);
    return success(reply, { coin, balance_cents: balance });
  });

  fastify.post('/:coin/transfer', {
    preHandler: [requireAuth, rateLimitByAgent],
    schema: {
      tags: ['Wallet'],
      description: 'Transfer balance from the authenticated agent to another agent for the given coin.',
      params: {
        type: 'object',
        required: ['coin'],
        properties: {
          coin: { type: 'string', maxLength: 16 },
        },
      },
      body: {
        type: 'object',
        required: ['to_agent', 'amount'],
        properties: {
          to_agent: { type: 'string', format: 'uuid' },
          amount: { type: 'integer', minimum: 1, description: 'Amount in cents' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                from_agent: { type: 'string', format: 'uuid', description: 'Agent that sent the transfer' },
                to_agent: { type: 'string', format: 'uuid', description: 'Agent that received the transfer' },
                amount: { type: 'integer', description: 'Amount in cents' },
                coin: { type: 'string', description: 'Coin symbol' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const fromAgentId = request.agentId;
    const coin = (request.params.coin || '').toString().slice(0, 16).toUpperCase();
    const { to_agent: toAgentId, amount } = request.body || {};
    if (!coin) return badRequest(reply, 'coin is required');
    if (!toAgentId || amount == null || amount < 1) {
      return badRequest(reply, 'to_agent and amount (positive) are required');
    }
    const fromAgent = await agentsDb.getById(fromAgentId);
    const maxTx = fromAgent ? getMaxTransferPerTxCents(fromAgent.trust_level ?? 0) : null;
    if (maxTx != null && amount > maxTx) {
      return forbidden(reply, `Transfer amount exceeds your trust level limit (max ${maxTx} cents per transaction)`);
    }
    try {
      await walletsDb.transfer(fromAgentId, toAgentId, coin, amount);
      metrics.walletTransfer(coin);
      return success(reply, { from_agent: fromAgentId, to_agent: toAgentId, amount, coin });
    } catch (e) {
      if (e.code === 'INSUFFICIENT_BALANCE') {
        return conflict(reply, 'Insufficient balance');
      }
      throw e;
    }
  });

  fastify.get('/:coin/statement', {
    preHandler: requireAuth,
    schema: {
      tags: ['Wallet'],
      description: 'List ledger entries (statement) for the authenticated agent and coin. Supports filter by type, date range, offset and limit.',
      params: {
        type: 'object',
        required: ['coin'],
        properties: {
          coin: { type: 'string', maxLength: 16 },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['credit', 'debit'], description: 'Filter by entry type' },
          from_date: { type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD, inclusive)' },
          to_date: { type: 'string', format: 'date', description: 'End date (YYYY-MM-DD, inclusive)' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Items per page' },
          offset: { type: 'integer', minimum: 0, default: 0, description: 'Skip N items' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  uuid: { type: 'string', format: 'uuid' },
                  type: { type: 'string', enum: ['credit', 'debit'] },
                  amount_cents: { type: 'integer' },
                  metadata: { type: ['object', 'null'] },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                limit: { type: 'integer' },
                offset: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const agentId = request.agentId;
    const coin = (request.params.coin || '').toString().slice(0, 16).toUpperCase();
    if (!coin) return badRequest(reply, 'coin is required');
    const q = request.query || {};
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const { rows, total } = await walletsDb.getStatement(agentId, coin, {
      type: q.filter || undefined,
      from_date: q.from_date || undefined,
      to_date: q.to_date || undefined,
      limit,
      offset,
    });
    return list(reply, rows, { total, limit, offset });
  });
}

module.exports = walletRoutes;
