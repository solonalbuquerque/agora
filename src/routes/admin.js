'use strict';

const config = require('../config');
const { query, withTransaction } = require('../db/index');
const walletsDb = require('../db/wallets');
const issuersDb = require('../db/issuers');
const servicesDb = require('../db/services');
const bridgeDb = require('../db/bridgeTransfers');
const instanceDb = require('../db/instance');
const { created, success } = require('../lib/responses');
const { badRequest, unauthorized, forbidden, conflict, notFound } = require('../lib/errors');
const { createRateLimitPreHandler } = require('../lib/security/rateLimit');
const { recordAuditEvent } = require('../lib/audit');
const { isReservedCoin } = require('../lib/compliance');

function requireAdmin(request, reply, done) {
  const token = request.headers['x-admin-token'];
  if (!config.adminToken || config.adminToken !== token) {
    return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid or missing admin token' });
  }
  done();
}

const rateLimitAdmin = createRateLimitPreHandler({ scope: 'ip', keyPrefix: 'admin' });

async function adminRoutes(fastify) {
  fastify.addHook('preHandler', rateLimitAdmin);
  fastify.addHook('preHandler', requireAdmin);

  fastify.post('/mint', {
    schema: {
      tags: ['Admin'],
      description: 'Mint (credit) balance to an agent. Idempotent when external_ref is provided.',
      headers: {
        type: 'object',
        properties: { 'X-Admin-Token': { type: 'string' } },
        required: ['X-Admin-Token'],
      },
      body: {
        type: 'object',
        required: ['agent_id', 'coin', 'amount_cents'],
        properties: {
          agent_id: { type: 'string' },
          coin: { type: 'string', maxLength: 16 },
          amount_cents: { type: 'integer', minimum: 1 },
          external_ref: { type: 'string' },
          reason: { type: 'string' },
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
                coin: { type: 'string' },
                amount_cents: { type: 'integer' },
                ledger_id: { type: 'integer' },
              },
            },
          },
        },
        429: { type: 'object', properties: { ok: { type: 'boolean' }, code: { type: 'string' }, message: { type: 'string' } }, description: 'Rate limit exceeded' },
      },
    },
  }, async (request, reply) => {
    const { agent_id: agentId, coin, amount_cents: amountCents, external_ref: externalRef, reason } = request.body || {};
    if (!agentId || !coin || amountCents == null || amountCents < 1) {
      return badRequest(reply, 'agent_id, coin, and amount_cents (positive) are required');
    }
    // Verificar se o agent existe antes de tentar criar a wallet
    const agentCheck = await query('SELECT id FROM agents WHERE id = $1', [agentId]);
    if (agentCheck.rows.length === 0) {
      return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: `Agent ${agentId} not found` });
    }
    const coinNorm = coin.toString().slice(0, 16).toUpperCase();
    if (isReservedCoin(coinNorm)) {
      return reply.code(403).send({ ok: false, code: 'RESERVED_COIN_MINT_FORBIDDEN', message: 'AGO cannot be minted locally. Use issuer credit when instance is compliant.' });
    }
    if (externalRef) {
      const exists = await walletsDb.existsLedgerByExternalRef(null, coinNorm, externalRef);
      if (exists) return conflict(reply, 'external_ref already used');
    }
    let ledgerId;
    await withTransaction(async (client) => {
      await walletsDb.ensureCoin(client, coinNorm);
      await walletsDb.ensureWallet(client, agentId, coinNorm);
      await client.query(
        'UPDATE wallets SET balance_cents = balance_cents + $1 WHERE agent_id = $2 AND coin = $3',
        [amountCents, agentId, coinNorm]
      );
      const metadata = reason ? { reason, admin: true } : { admin: true };
      const requestId = request.requestId || null;
      const q = `INSERT INTO ledger_entries (uuid, agent_id, coin, type, amount_cents, metadata, external_ref, request_id)
                 VALUES (gen_random_uuid(), $1, $2, 'credit', $3, $4, $5, $6) RETURNING id`;
      const r = await client.query(q, [agentId, coinNorm, amountCents, JSON.stringify(metadata), externalRef || null, requestId]);
      ledgerId = r.rows[0].id;
    });
    await recordAuditEvent({
      event_type: 'ADMIN_MINT',
      actor_type: 'admin',
      actor_id: null,
      target_type: 'wallet',
      target_id: agentId,
      metadata: { coin: coinNorm, amount_cents: amountCents, ledger_id: ledgerId },
      request_id: request.requestId,
    });
    return created(reply, {
      agent_id: agentId,
      coin: coinNorm,
      amount_cents: amountCents,
      ledger_id: ledgerId,
    });
  });

  fastify.post('/issuers', {
    schema: {
      tags: ['Admin'],
      description: 'Create an issuer (HMAC secret for signing credits). Optionally set is_central for AGO Central issuer.',
      body: {
        type: 'object',
        required: ['name', 'secret'],
        properties: {
          name: { type: 'string' },
          secret: { type: 'string' },
          is_central: { type: 'boolean', default: false },
        },
      },
      response: { 201: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } },
    },
  }, async (request, reply) => {
    const { name, secret, is_central: isCentral } = request.body || {};
    if (!name || !secret) return badRequest(reply, 'name and secret are required');
    const issuer = await issuersDb.createIssuer(name, secret, true, !!isCentral);
    await recordAuditEvent({
      event_type: 'ADMIN_ISSUER_CREATE',
      actor_type: 'admin',
      target_type: 'issuer',
      target_id: issuer.id,
      metadata: { name: issuer.name },
      request_id: request.requestId,
    });
    return created(reply, { id: issuer.id, name: issuer.name, status: issuer.status });
  });

  fastify.post('/issuers/:id/revoke', {
    schema: {
      tags: ['Admin'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } },
    },
  }, async (request, reply) => {
    const issuer = await issuersDb.revoke(request.params.id);
    if (!issuer) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Issuer not found' });
    await recordAuditEvent({
      event_type: 'ADMIN_ISSUER_REVOKE',
      actor_type: 'admin',
      target_type: 'issuer',
      target_id: issuer.id,
      request_id: request.requestId,
    });
    return success(reply, issuer);
  });

  fastify.post('/services/:id/resume', {
    schema: {
      tags: ['Admin'],
      description: 'Resume a service after circuit breaker paused it. Sets status back to active.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } },
        404: { type: 'object', properties: { ok: { type: 'boolean' }, code: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const serviceId = request.params.id;
    const service = await servicesDb.getById(serviceId);
    if (!service) return notFound(reply, 'Service not found');
    const updated = await servicesDb.update(serviceId, { status: 'active' });
    await recordAuditEvent({
      event_type: 'SERVICE_RESUMED',
      actor_type: 'admin',
      target_type: 'service',
      target_id: serviceId,
      request_id: request.requestId,
    });
    return success(reply, updated);
  });

    fastify.post('/services/:id/resume-export', {
    schema: {
      tags: ['Admin'],
      description: 'Resume export for a suspended exported service. Requires instance compliant and export_services_enabled.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } },
        403: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
        404: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const compliance = require('../lib/compliance');
    const staffSettingsDb = require('../db/staffSettings');
    const serviceId = request.params.id;
    const service = await servicesDb.getById(serviceId);
    if (!service) return notFound(reply, 'Service not found');
    if (service.visibility !== 'exported') {
      return reply.code(400).send({ ok: false, code: 'BAD_REQUEST', message: 'Service is not exported' });
    }
    const compliant = await compliance.isInstanceCompliant();
    if (!compliant) {
      return reply.code(403).send({ ok: false, code: 'INSTANCE_NOT_COMPLIANT', message: 'Instance must be compliant to resume exports' });
    }
    const exportEnabled = await staffSettingsDb.get('export_services_enabled');
    if (exportEnabled !== 'true') {
      return reply.code(403).send({ ok: false, code: 'EXPORTS_DISABLED', message: 'Export is disabled in settings' });
    }
    const updated = await servicesDb.resumeExport(serviceId);
    await recordAuditEvent({
      event_type: 'SERVICE_EXPORT_RESUMED',
      actor_type: 'admin',
      target_type: 'service',
      target_id: serviceId,
      request_id: request.requestId,
    });
    return success(reply, updated);
  });

  fastify.patch('/instance/:id/status', {
    schema: {
      tags: ['Admin'],
      description: 'Update instance status (e.g. flag, block, unblock). Setting to non-registered suspends exported services.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['unregistered', 'pending', 'registered', 'flagged', 'blocked'] } },
      },
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } },
        404: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body || {};
    const inst = await instanceDb.getById(id);
    if (!inst) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Instance not found' });
    const updated = await instanceDb.updateStatus(id, status);
    if (status && status !== 'registered') {
      const n = await servicesDb.suspendAllExported('INSTANCE_NOT_COMPLIANT');
      if (n > 0) {
        request.log.info({ suspended_count: n }, 'Suspended exported services after instance status change');
      }
    }
    await recordAuditEvent({
      event_type: 'INSTANCE_STATUS_CHANGED',
      actor_type: 'admin',
      target_type: 'instance',
      target_id: id,
      metadata: { status },
      request_id: request.requestId,
    });
    return success(reply, updated);
  });

  fastify.post('/bridge/:id/settle', {
    schema: {
      tags: ['Admin'],
      description: 'Settle a pending bridge transfer. Converts hold_outbound to debit_outbound and marks transfer settled.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } },
        404: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
        409: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const transfer = await bridgeDb.getById(id);
    if (!transfer) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Bridge transfer not found' });
    if (transfer.status !== 'pending') {
      return reply.code(409).send({ ok: false, code: 'CONFLICT', message: `Transfer is not pending (status: ${transfer.status})` });
    }
    await withTransaction(async (client) => {
      await walletsDb.insertLedgerEntry(client, transfer.from_agent_id, transfer.coin, 'debit_outbound', transfer.amount_cents, { bridge_transfer_id: id }, null, request.requestId);
    });
    const updated = await bridgeDb.updateStatus(id, 'settled');
    await recordAuditEvent({
      event_type: 'BRIDGE_TRANSFER_SETTLED',
      actor_type: 'admin',
      target_type: 'wallet',
      target_id: transfer.from_agent_id,
      metadata: { bridge_transfer_id: id, coin: transfer.coin, amount_cents: transfer.amount_cents },
      request_id: request.requestId,
    });
    return success(reply, updated);
  });

  fastify.post('/bridge/:id/reject', {
    schema: {
      tags: ['Admin'],
      description: 'Reject a pending bridge transfer. Refunds hold to agent and marks transfer rejected.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: { reason: { type: 'string' } },
      },
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } },
        404: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
        409: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const reason = (request.body || {}).reason || null;
    const transfer = await bridgeDb.getById(id);
    if (!transfer) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Bridge transfer not found' });
    if (transfer.status !== 'pending') {
      return reply.code(409).send({ ok: false, code: 'CONFLICT', message: `Transfer is not pending (status: ${transfer.status})` });
    }
    await withTransaction(async (client) => {
      await walletsDb.credit(client, transfer.from_agent_id, transfer.coin, transfer.amount_cents, { bridge_refund: id }, request.requestId);
    });
    const updated = await bridgeDb.updateStatus(id, 'rejected', reason);
    await recordAuditEvent({
      event_type: 'BRIDGE_TRANSFER_REJECTED',
      actor_type: 'admin',
      target_type: 'wallet',
      target_id: transfer.from_agent_id,
      metadata: { bridge_transfer_id: id, coin: transfer.coin, amount_cents: transfer.amount_cents, reason },
      request_id: request.requestId,
    });
    return success(reply, updated);
  });

  fastify.get('/audit', {
    schema: {
      tags: ['Admin'],
      description: 'List audit events. Filters: actor_type, actor_id, event_type, from_date, to_date, limit, offset.',
      querystring: {
        type: 'object',
        properties: {
          actor_type: { type: 'string', enum: ['human', 'admin', 'issuer', 'system'] },
          actor_id: { type: 'string' },
          event_type: { type: 'string' },
          from_date: { type: 'string', format: 'date-time' },
          to_date: { type: 'string', format: 'date-time' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
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
                rows: { type: 'array', items: { type: 'object' } },
                total: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const auditDb = require('../db/audit');
    const { rows, total } = await auditDb.list({
      actor_type: request.query?.actor_type,
      actor_id: request.query?.actor_id,
      event_type: request.query?.event_type,
      from_date: request.query?.from_date,
      to_date: request.query?.to_date,
      limit: request.query?.limit,
      offset: request.query?.offset,
    });
    return reply.send({ ok: true, data: { rows, total } });
  });
}

module.exports = adminRoutes;
