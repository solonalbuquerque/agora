'use strict';

const path = require('path');
const config = require('../config');
const agentsDb = require('../db/agents');
const { requireAgentAuth } = require('../lib/auth');
const { success } = require('../lib/responses');

const staffUiDist = path.join(__dirname, '../../staff-ui/dist');

async function getAgentSecret(agentId) {
  return agentsDb.getSecretById(agentId);
}

const requireAuth = requireAgentAuth(getAgentSecret);

async function routes(fastify) {
  fastify.get('/swagger.json', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    const spec = await fastify.swagger();
    // Do not expose staff routes in Swagger
    if (spec.paths) {
      for (const pathKey of Object.keys(spec.paths)) {
        if (pathKey.startsWith('/staff')) delete spec.paths[pathKey];
      }
    }
    if (spec.tags && Array.isArray(spec.tags)) {
      spec.tags = spec.tags.filter((t) => t.name !== 'Staff');
    }
    return reply.send(spec);
  });

  fastify.get('/health', {
    schema: {
      tags: ['Health'],
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
  fastify.register(require('./human'), { prefix: '/human' });
  if (config.enableStaff) {
    fastify.register(require('@fastify/static'), {
      root: path.join(staffUiDist, 'assets'),
      prefix: '/staff/assets/',
    });
    fastify.register(require('./staff'), { prefix: '/staff', staffUiDist });
  }
  fastify.register(require('./admin'), { prefix: '/admin' });
  fastify.register(require('./faucet'), { prefix: '' });
  fastify.register(require('./issuer'), { prefix: '/issuer' });
  fastify.register(require('./instance'), { prefix: '/instance' });
}

module.exports = routes;
