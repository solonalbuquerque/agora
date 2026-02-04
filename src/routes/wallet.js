'use strict';

const walletsDb = require('../db/wallets');
const { success } = require('../lib/responses');
const { badRequest, conflict } = require('../lib/errors');

async function walletRoutes(fastify, opts) {
  const requireAuth = opts.requireAgentAuth;
  if (!requireAuth) {
    throw new Error('walletRoutes requires requireAgentAuth');
  }

  fastify.get('/:coin/balance', {
    preHandler: requireAuth,
    schema: {
      description: 'Get the authenticated agent balance for the given coin.',
      params: {
        type: 'object',
        required: ['coin'],
        properties: {
          coin: { type: 'string', maxLength: 4 },
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
    const coin = (request.params.coin || '').toString().slice(0, 4).toUpperCase();
    if (!coin) return badRequest(reply, 'coin is required');
    const balance = await walletsDb.getBalance(agentId, coin);
    return success(reply, { coin, balance_cents: balance });
  });

  fastify.post('/:coin/transfer', {
    preHandler: requireAuth,
    schema: {
      description: 'Transfer balance from the authenticated agent to another agent for the given coin.',
      params: {
        type: 'object',
        required: ['coin'],
        properties: {
          coin: { type: 'string', maxLength: 4 },
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
            data: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const fromAgentId = request.agentId;
    const coin = (request.params.coin || '').toString().slice(0, 4).toUpperCase();
    const { to_agent: toAgentId, amount } = request.body || {};
    if (!coin) return badRequest(reply, 'coin is required');
    if (!toAgentId || amount == null || amount < 1) {
      return badRequest(reply, 'to_agent and amount (positive) are required');
    }
    try {
      await walletsDb.transfer(fromAgentId, toAgentId, coin, amount);
      return success(reply, { from_agent: fromAgentId, to_agent: toAgentId, amount, coin });
    } catch (e) {
      if (e.code === 'INSUFFICIENT_BALANCE') {
        return conflict(reply, 'Insufficient balance');
      }
      throw e;
    }
  });
}

module.exports = walletRoutes;
