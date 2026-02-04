'use strict';

const agentsDb = require('../db/agents');
const { requireAgentAuth } = require('../lib/auth');
const { success } = require('../lib/responses');

async function getAgentSecret(agentId) {
  return agentsDb.getSecretById(agentId);
}

const requireAuth = requireAgentAuth(getAgentSecret);

async function routes(fastify) {
  fastify.get('/swagger.json', async (_request, reply) => {
    return reply.send(await fastify.swagger());
  });

  fastify.get('/health', {
    schema: {
      description: 'Health check for load balancers and Docker.',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                service: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (_request, reply) => {
    return success(reply, { status: 'ok', service: 'agora-core' });
  });

  fastify.register(require('./agents'), { prefix: '/agents', requireAgentAuth: requireAuth });
  fastify.register(require('./wallet'), { prefix: '/wallet', requireAgentAuth: requireAuth });
  fastify.register(require('./services'), { prefix: '/services', requireAgentAuth: requireAuth });
  fastify.register(require('./executions'), { prefix: '', requireAgentAuth: requireAuth });
  fastify.register(require('./reputation'), { prefix: '/reputation' });
}

module.exports = routes;
