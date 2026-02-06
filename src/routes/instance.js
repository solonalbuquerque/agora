'use strict';

const instanceDb = require('../db/instance');
const config = require('../config');
const { created, success } = require('../lib/responses');
const { badRequest } = require('../lib/errors');
const { recordAuditEvent } = require('../lib/audit');

function getInstanceToken(request) {
  return request.headers['x-instance-token'] || (request.headers.authorization && request.headers.authorization.replace(/^Bearer\s+/i, ''));
}

async function requireInstanceOrAdmin(request, reply) {
  const instanceToken = getInstanceToken(request);
  const adminToken = request.headers['x-admin-token'];
  if (adminToken && config.adminToken && adminToken === config.adminToken) {
    request.isAdmin = true;
    return;
  }
  if (!instanceToken) {
    return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Missing X-Instance-Token or X-Admin-Token' });
  }
  const inst = await instanceDb.findByActivationToken(instanceToken);
  if (!inst) {
    return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid instance token' });
  }
  request.instance = inst;
  request.instanceId = inst.id;
  instanceDb.updateLastSeen(inst.id).catch(() => {});
}

async function instanceRoutes(fastify) {
  fastify.post('/register', {
    schema: {
      tags: ['Instance'],
      description: 'Register this installation. Returns registration_code (shown once).',
      body: {
        type: 'object',
        required: ['name', 'owner_email'],
        properties: {
          name: { type: 'string' },
          owner_email: { type: 'string', format: 'email' },
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
                instance_id: { type: 'string', format: 'uuid' },
                status: { type: 'string' },
                registration_code: { type: 'string' },
                expires_at: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { name, owner_email: ownerEmail } = request.body || {};
    if (!name || !ownerEmail) return badRequest(reply, 'name and owner_email are required');
    const result = await instanceDb.register(name, ownerEmail);
    return created(reply, {
      instance_id: result.id,
      status: result.status,
      registration_code: result.registration_code,
      expires_at: result.expires_at,
    });
  });

  fastify.post('/activate', {
    schema: {
      tags: ['Instance'],
      description: 'Activate instance with registration_code and activation_token (from Official or admin).',
      body: {
        type: 'object',
        required: ['instance_id', 'registration_code', 'activation_token'],
        properties: {
          instance_id: { type: 'string', format: 'uuid' },
          registration_code: { type: 'string' },
          activation_token: { type: 'string' },
          official_issuer_id: { type: 'string', format: 'uuid' },
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
                instance_id: { type: 'string' },
                status: { type: 'string' },
                registered_at: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { instance_id: instanceId, registration_code: registrationCode, activation_token: activationToken, official_issuer_id: officialIssuerId } = request.body || {};
    if (!instanceId || !registrationCode || !activationToken) return badRequest(reply, 'instance_id, registration_code, and activation_token are required');
    const inst = await instanceDb.activate(instanceId, registrationCode, activationToken, officialIssuerId);
    if (!inst) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST', message: 'Invalid or expired registration code' });
    await recordAuditEvent({
      event_type: 'INSTANCE_ACTIVATE',
      actor_type: 'system',
      target_type: 'instance',
      target_id: inst.id,
      metadata: { official_issuer_id: officialIssuerId || null },
      request_id: request.requestId,
    });
    return success(reply, { instance_id: inst.id, status: inst.status, registered_at: inst.registered_at });
  });

  fastify.get('/status', {
    preHandler: requireInstanceOrAdmin,
    schema: {
      tags: ['Instance'],
      description: 'Instance status. Auth: X-Instance-Token (activation token) or X-Admin-Token. Updates last_seen_at.',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                instance_id: { type: 'string' },
                status: { type: 'string' },
                registered_at: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    let inst = request.instance;
    if (request.isAdmin) {
      if (!request.query?.instance_id) return badRequest(reply, 'instance_id query param required when using admin token');
      inst = await instanceDb.getById(request.query.instance_id);
    } else if (!inst && request.instanceId) {
      inst = await instanceDb.getById(request.instanceId);
    }
    if (!inst) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Instance not found' });
    return success(reply, { instance_id: inst.id, status: inst.status, registered_at: inst.registered_at });
  });
}

module.exports = instanceRoutes;
