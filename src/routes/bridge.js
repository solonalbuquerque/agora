'use strict';

const { withTransaction } = require('../db/index');
const walletsDb = require('../db/wallets');
const bridgeDb = require('../db/bridgeTransfers');
const compliance = require('../lib/compliance');
const { created } = require('../lib/responses');
const { badRequest, conflict } = require('../lib/errors');
const { createRateLimitPreHandler } = require('../lib/security/rateLimit');
const { recordAuditEvent } = require('../lib/audit');

const rateLimitBridge = createRateLimitPreHandler({ scope: 'agent', keyPrefix: 'bridge' });

async function bridgeRoutes(fastify, opts) {
  const requireAuth = opts.requireAgentAuth;
  if (!requireAuth) throw new Error('bridgeRoutes requires requireAgentAuth');

  fastify.post('/transfer', {
    preHandler: [requireAuth, rateLimitBridge],
    schema: {
      tags: ['Bridge'],
      description: 'Request AGO outbound to another instance. Compliance required. Creates hold and pending transfer.',
      body: {
        type: 'object',
        required: ['coin', 'amount_cents'],
        properties: {
          coin: { type: 'string', maxLength: 16 },
          amount_cents: { type: 'integer', minimum: 1 },
          to_instance_id: { type: 'string' },
          to_agent_id: { type: 'string' },
          external_ref: { type: 'string' },
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
                transfer_id: { type: 'string', format: 'uuid' },
                status: { type: 'string', enum: ['pending'] },
              },
            },
          },
        },
        403: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, description: 'INSTANCE_NOT_COMPLIANT' },
      },
    },
  }, async (request, reply) => {
    const agentId = request.agentId;
    const { coin, amount_cents: amountCents, to_instance_id: toInstanceId, to_agent_id: toAgentId, external_ref: externalRef } = request.body || {};
    const coinNorm = (coin || '').toString().slice(0, 16).toUpperCase();

    if (!coinNorm || amountCents == null || amountCents < 1) {
      return badRequest(reply, 'coin and amount_cents (positive) are required');
    }

    if (compliance.isReservedCoin(coinNorm)) {
      const allowed = await compliance.requireCompliantForAgoOutbound(reply);
      if (!allowed) {
        await recordAuditEvent({
          event_type: 'BRIDGE_TRANSFER_REJECTED',
          actor_type: 'system',
          actor_id: agentId,
          target_type: 'wallet',
          target_id: agentId,
          metadata: { coin: coinNorm, amount_cents: amountCents, reason: 'INSTANCE_NOT_COMPLIANT' },
          request_id: request.requestId,
        });
        return;
      }
    }

    if (externalRef) {
      const existing = await bridgeDb.getByExternalRef(externalRef);
      if (existing) {
        return created(reply, { transfer_id: existing.id, status: existing.status });
      }
    }

    const balance = await walletsDb.getBalance(agentId, coinNorm);
    if (balance < amountCents) {
      return conflict(reply, 'Insufficient balance');
    }

    let transfer;
    await withTransaction(async (client) => {
      await walletsDb.debitHold(client, agentId, coinNorm, amountCents, { to_instance_id: toInstanceId, to_agent_id: toAgentId }, request.requestId);
      transfer = await bridgeDb.create({
        kind: 'cross_instance',
        from_agent_id: agentId,
        coin: coinNorm,
        amount_cents: amountCents,
        to_instance_id: toInstanceId || null,
        to_agent_id: toAgentId || null,
        destination_ref: null,
        external_ref: externalRef || null,
        request_id: request.requestId,
      });
    });

    await recordAuditEvent({
      event_type: 'BRIDGE_TRANSFER_CREATED',
      actor_type: 'system',
      actor_id: agentId,
      target_type: 'wallet',
      target_id: agentId,
      metadata: { transfer_id: transfer.id, coin: coinNorm, amount_cents: amountCents },
      request_id: request.requestId,
    });
    return created(reply, { transfer_id: transfer.id, status: 'pending' });
  });

  fastify.post('/cashout', {
    preHandler: [requireAuth, rateLimitBridge],
    schema: {
      tags: ['Bridge'],
      description: 'Request AGO cashout to bank rails. Compliance required. Creates hold and pending transfer.',
      body: {
        type: 'object',
        required: ['coin', 'amount_cents', 'destination_ref'],
        properties: {
          coin: { type: 'string', maxLength: 16 },
          amount_cents: { type: 'integer', minimum: 1 },
          destination_ref: { type: 'string' },
          external_ref: { type: 'string' },
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
                transfer_id: { type: 'string', format: 'uuid' },
                status: { type: 'string', enum: ['pending'] },
              },
            },
          },
        },
        403: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, description: 'INSTANCE_NOT_COMPLIANT' },
      },
    },
  }, async (request, reply) => {
    const agentId = request.agentId;
    const { coin, amount_cents: amountCents, destination_ref: destinationRef, external_ref: externalRef } = request.body || {};
    const coinNorm = (coin || '').toString().slice(0, 16).toUpperCase();

    if (!coinNorm || amountCents == null || amountCents < 1 || !destinationRef) {
      return badRequest(reply, 'coin, amount_cents, and destination_ref are required');
    }

    if (compliance.isReservedCoin(coinNorm)) {
      const allowed = await compliance.requireCompliantForAgoOutbound(reply);
      if (!allowed) {
        await recordAuditEvent({
          event_type: 'BRIDGE_CASHOUT_REJECTED',
          actor_type: 'system',
          actor_id: agentId,
          target_type: 'wallet',
          target_id: agentId,
          metadata: { coin: coinNorm, amount_cents: amountCents, reason: 'INSTANCE_NOT_COMPLIANT' },
          request_id: request.requestId,
        });
        return;
      }
    }

    if (externalRef) {
      const existing = await bridgeDb.getByExternalRef(externalRef);
      if (existing) {
        return created(reply, { transfer_id: existing.id, status: existing.status });
      }
    }

    const balance = await walletsDb.getBalance(agentId, coinNorm);
    if (balance < amountCents) {
      return conflict(reply, 'Insufficient balance');
    }

    let transfer;
    await withTransaction(async (client) => {
      await walletsDb.debitHold(client, agentId, coinNorm, amountCents, { destination_ref: destinationRef }, request.requestId);
      transfer = await bridgeDb.create({
        kind: 'cashout',
        from_agent_id: agentId,
        coin: coinNorm,
        amount_cents: amountCents,
        to_instance_id: null,
        to_agent_id: null,
        destination_ref: destinationRef,
        external_ref: externalRef || null,
        request_id: request.requestId,
      });
    });

    await recordAuditEvent({
      event_type: 'BRIDGE_CASHOUT_CREATED',
      actor_type: 'system',
      actor_id: agentId,
      target_type: 'wallet',
      target_id: agentId,
      metadata: { transfer_id: transfer.id, coin: coinNorm, amount_cents: amountCents },
      request_id: request.requestId,
    });
    return created(reply, { transfer_id: transfer.id, status: 'pending' });
  });
}

module.exports = bridgeRoutes;
