'use strict';

const config = require('../config');
const { query, withTransaction } = require('../db/index');
const walletsDb = require('../db/wallets');
const issuersDb = require('../db/issuers');
const { created, success } = require('../lib/responses');
const { badRequest, unauthorized, forbidden, conflict } = require('../lib/errors');

function requireAdmin(request, reply, done) {
  const token = request.headers['x-admin-token'];
  if (!config.adminToken || config.adminToken !== token) {
    return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid or missing admin token' });
  }
  done();
}

async function adminRoutes(fastify) {
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
      const q = `INSERT INTO ledger_entries (uuid, agent_id, coin, type, amount_cents, metadata, external_ref)
                 VALUES (gen_random_uuid(), $1, $2, 'credit', $3, $4, $5) RETURNING id`;
      const r = await client.query(q, [agentId, coinNorm, amountCents, JSON.stringify(metadata), externalRef || null]);
      ledgerId = r.rows[0].id;
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
      description: 'Create an issuer (HMAC secret for signing credits).',
      body: {
        type: 'object',
        required: ['name', 'secret'],
        properties: {
          name: { type: 'string' },
          secret: { type: 'string' },
        },
      },
      response: { 201: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } },
    },
  }, async (request, reply) => {
    const { name, secret } = request.body || {};
    if (!name || !secret) return badRequest(reply, 'name and secret are required');
    const issuer = await issuersDb.createIssuer(name, secret, true);
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
    return success(reply, issuer);
  });
}

module.exports = adminRoutes;
