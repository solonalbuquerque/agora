'use strict';

const crypto = require('crypto');
const agentsDb = require('../db/agents');
const staffSettingsDb = require('../db/staffSettings');
const { created, success } = require('../lib/responses');
const { badRequest, forbidden } = require('../lib/errors');
const { createRateLimitPreHandler } = require('../lib/security/rateLimit');

const rateLimitRegister = createRateLimitPreHandler({ scope: 'ip', keyPrefix: 'agents_register' });

function hashRegistrationKey(key) {
  return crypto.createHash('sha256').update(String(key).trim(), 'utf8').digest('hex');
}

async function agentsRoutes(fastify, opts) {
  const requireAuth = opts.requireAgentAuth || null;

  fastify.post('/register', {
    preHandler: rateLimitRegister,
    schema: {
      tags: ['Agents'],
      description: 'Create a new pseudonymous agent. The secret is returned only once; store it securely. When public registration is gated, registration_key (body or header) may be required.',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          registration_key: { type: 'string', description: 'Required when instance has a registration key set (temporary password from staff panel).' },
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
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                secret: { type: 'string', description: 'Only returned once; store securely.' },
              },
            },
          },
        },
        403: { type: 'object', properties: { ok: { type: 'boolean' }, code: { type: 'string' }, message: { type: 'string' } } },
        429: { type: 'object', properties: { ok: { type: 'boolean' }, code: { type: 'string' }, message: { type: 'string' } }, description: 'Rate limit exceeded' },
      },
    },
  }, async (request, reply) => {
    const enabled = (await staffSettingsDb.get('public_bot_registration_enabled')) === 'true';
    if (!enabled) {
      return forbidden(reply, 'Public bot registration is disabled. Only staff can create agents.');
    }
    const keyHash = await staffSettingsDb.get('public_bot_registration_key_hash');
    if (keyHash && keyHash.length > 0) {
      const provided = (request.body?.registration_key || request.headers['x-registration-key'] || '').toString().trim();
      if (!provided) {
        return forbidden(reply, 'Registration key is required (body registration_key or header X-Registration-Key).');
      }
      const providedHash = hashRegistrationKey(provided);
      if (providedHash.length !== keyHash.length || !crypto.timingSafeEqual(Buffer.from(providedHash, 'hex'), Buffer.from(keyHash, 'hex'))) {
        return forbidden(reply, 'Invalid registration key.');
      }
    }
    const name = request.body?.name;
    if (!name || typeof name !== 'string') {
      return badRequest(reply, 'name is required');
    }
    const { id, secret } = await agentsDb.create(name);
    return created(reply, { id, name, secret });
  });

  fastify.get('/me', {
    preHandler: requireAuth,
    schema: {
      tags: ['Agents'],
      description: 'Return the authenticated agent data (no secret).',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                status: { type: 'string' },
                trust_level: { type: 'integer' },
                created_at: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const agent = await agentsDb.getById(request.agentId);
    if (!agent) {
      return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Agent not found' });
    }
    return success(reply, agent);
  });
}

module.exports = agentsRoutes;
