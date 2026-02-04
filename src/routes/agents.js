'use strict';

const agentsDb = require('../db/agents');
const { created, success } = require('../lib/responses');
const { badRequest } = require('../lib/errors');

async function agentsRoutes(fastify, opts) {
  const requireAuth = opts.requireAgentAuth || null;

  fastify.post('/register', {
    schema: {
      tags: ['Agents'],
      description: 'Create a new pseudonymous agent. The secret is returned only once; store it securely.',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
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
      },
    },
  }, async (request, reply) => {
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
