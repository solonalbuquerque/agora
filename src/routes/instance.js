'use strict';

const instanceDb = require('../db/instance');
const config = require('../config');
const { created, success } = require('../lib/responses');
const { badRequest } = require('../lib/errors');
const { recordAuditEvent } = require('../lib/audit');
const centralClient = require('../lib/centralClient');
const logger = require('../lib/logger');

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
    request.log?.info({ path: '/instance/register', body: { name: request.body?.name ? '[set]' : null, owner_email: request.body?.owner_email ? '[set]' : null } }, 'POST /instance/register received');
    const { name, owner_email: ownerEmail } = request.body || {};
    if (!name || !ownerEmail) return badRequest(reply, 'name and owner_email are required');
    const requestId = request.requestId || null;

    if (config.agoraCenterUrl) {
      const baseUrl = (config.agoraPublicUrl || '').replace(/\/$/, '') || `http://localhost:${config.port || 3000}`;
      let centralRes;
      try {
        centralRes = await centralClient.registerCentral(config.agoraCenterUrl, name.trim(), baseUrl, requestId);
        const inst = await instanceDb.registerFromCentral(
          centralRes.instance_id,
          name.trim(),
          ownerEmail.trim()
        );
        if (!inst) {
          request.log?.warn({ instance_id: centralRes.instance_id }, 'registerFromCentral returned null');
          return reply.code(500).send({
            ok: false,
            code: 'REGISTER_SYNC_FAILED',
            message: 'Central register succeeded but local sync failed. Check server logs.',
            debug: { central_instance_id: centralRes.instance_id },
          });
        }
        return created(reply, {
          instance_id: centralRes.instance_id,
          status: inst.status,
          registration_code: centralRes.registration_code,
          expires_at: centralRes.expires_at,
        });
      } catch (err) {
        const code = err.code || 'CENTRAL_REGISTER_FAILED';
        const message = err.message || 'Central register failed';
        logger.log('error', message, { request_id: requestId, code, status: err.status, details: err.details });
        return reply.code(err.status && err.status >= 400 && err.status < 600 ? err.status : 502).send({
          ok: false,
          code,
          message,
          debug: config.agoraCenterUrl ? { central_url: config.agoraCenterUrl, base_url_sent: baseUrl } : undefined,
        });
      }
    }

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
      description: 'Activate instance. With Central: send instance_id + registration_code (token is fetched). Without: send instance_id + registration_code + activation_token.',
      body: {
        type: 'object',
        required: ['instance_id', 'registration_code'],
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
    request.log?.info({ path: '/instance/activate', instance_id: request.body?.instance_id }, 'POST /instance/activate received');
    const { instance_id: instanceId, registration_code: registrationCode, activation_token: activationToken, official_issuer_id: officialIssuerId } = request.body || {};
    if (!instanceId || !registrationCode) return badRequest(reply, 'instance_id and registration_code are required');

    let tokenToUse = activationToken;
    if (config.agoraCenterUrl && !tokenToUse) {
      try {
        const centralRes = await centralClient.activateCentral(config.agoraCenterUrl, instanceId, registrationCode, request.requestId);
        tokenToUse = centralRes.activation_token;
      } catch (err) {
        const code = err.code || 'CENTRAL_ACTIVATE_FAILED';
        logger.log('error', err.message, { request_id: request.requestId, code, status: err.status, details: err.details });
        return reply.code(err.status && err.status >= 400 && err.status < 600 ? err.status : 502).send({
          ok: false,
          code,
          message: err.message || 'Failed to get activation token from Central',
          debug: { central_url: config.agoraCenterUrl },
        });
      }
    }

    if (!tokenToUse) return badRequest(reply, 'activation_token is required when Central is not configured');

    let inst;
    if (config.agoraCenterUrl && tokenToUse) {
      inst = await instanceDb.activateWithToken(instanceId, tokenToUse, officialIssuerId);
    } else {
      inst = await instanceDb.activate(instanceId, registrationCode, tokenToUse, officialIssuerId);
    }
    if (!inst) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST', message: 'Invalid or expired registration code (or instance not found)' });
    await recordAuditEvent({
      event_type: 'INSTANCE_ACTIVATE',
      actor_type: 'system',
      target_type: 'instance',
      target_id: inst.id,
      metadata: { official_issuer_id: officialIssuerId || null, via_central: !!config.agoraCenterUrl },
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
