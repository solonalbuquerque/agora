'use strict';

const issuersDb = require('../db/issuers');
const walletsDb = require('../db/wallets');
const { buildSigningPayload, sha256Hex, isTimestampValid } = require('../lib/auth');
const { created } = require('../lib/responses');
const { badRequest, unauthorized, conflict } = require('../lib/errors');
const { withTransaction } = require('../db/index');

function requireIssuerSignature() {
  return async function preHandler(request, reply) {
    const issuerId = request.headers['x-issuer-id'];
    const timestamp = request.headers['x-issuer-timestamp'];
    const signature = request.headers['x-issuer-signature'];
    if (!issuerId || !timestamp || !signature) {
      return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Missing X-Issuer-Id, X-Issuer-Timestamp, or X-Issuer-Signature' });
    }
    if (!isTimestampValid(timestamp)) {
      return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Timestamp out of window' });
    }
    const issuer = await issuersDb.getById(issuerId);
    if (!issuer || issuer.status !== 'active') {
      return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Issuer not found or revoked' });
    }
    const secret = await issuersDb.getSecretById(issuerId);
    if (!secret) {
      return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Issuer not configured for HMAC' });
    }
    const method = request.method;
    const path = request.url ? request.url.split('?')[0] : request.routerPath || '/issuer/credit';
    const rawBody = request.rawBody != null ? request.rawBody : (request.body ? JSON.stringify(request.body) : '');
    const bodyHash = sha256Hex(rawBody);
    const payload = buildSigningPayload(issuerId, timestamp, method, path, bodyHash);
    const valid = issuersDb.verifySignature(secret, payload, signature);
    if (!valid) {
      return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid issuer signature' });
    }
    request.issuerId = issuerId;
  };
}

async function issuerRoutes(fastify) {
  fastify.post('/credit', {
    preHandler: requireIssuerSignature(),
    schema: {
      tags: ['Issuer'],
      description: 'Issue credit (mint) to an agent. Signed by issuer. external_ref required and idempotent.',
      headers: {
        type: 'object',
        properties: {
          'X-Issuer-Id': { type: 'string' },
          'X-Issuer-Timestamp': { type: 'string' },
          'X-Issuer-Signature': { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['agent_id', 'coin', 'amount_cents', 'external_ref'],
        properties: {
          agent_id: { type: 'string' },
          coin: { type: 'string', maxLength: 16 },
          amount_cents: { type: 'integer', minimum: 1 },
          external_ref: { type: 'string' },
          memo: { type: 'string' },
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
                external_ref: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { agent_id: agentId, coin, amount_cents: amountCents, external_ref: externalRef, memo } = request.body || {};
    if (!agentId || !coin || amountCents == null || amountCents < 1 || !externalRef) {
      return badRequest(reply, 'agent_id, coin, amount_cents, and external_ref are required');
    }
    const coinNorm = coin.toString().slice(0, 16).toUpperCase();
    const exists = await walletsDb.existsLedgerByExternalRef(null, coinNorm, externalRef);
    if (exists) return conflict(reply, 'external_ref already used (idempotent)');
    await withTransaction(async (client) => {
      await walletsDb.ensureCoin(client, coinNorm);
      await walletsDb.ensureWallet(client, agentId, coinNorm);
      await client.query(
        'UPDATE wallets SET balance_cents = balance_cents + $1 WHERE agent_id = $2 AND coin = $3',
        [amountCents, agentId, coinNorm]
      );
      const metadata = { issuer: request.issuerId };
      if (memo) metadata.memo = memo;
      await walletsDb.insertLedgerEntry(client, agentId, coinNorm, 'credit', amountCents, metadata, externalRef);
    });
    return created(reply, { agent_id: agentId, coin: coinNorm, amount_cents: amountCents, external_ref: externalRef });
  });
}

module.exports = issuerRoutes;
