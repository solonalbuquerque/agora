'use strict';

const reputationDb = require('../db/reputation');
const { success } = require('../lib/responses');
const { notFound } = require('../lib/errors');
const agentsDb = require('../db/agents');
const servicesDb = require('../db/services');

async function reputationRoutes(fastify) {
  fastify.get('/agents/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                agent_id: { type: 'string' },
                total_calls: { type: 'integer' },
                success_calls: { type: 'integer' },
                success_rate: { type: 'number' },
                avg_latency: { type: ['number', 'null'] },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const agentId = request.params.id;
    const agent = await agentsDb.getById(agentId);
    if (!agent) return notFound(reply, 'Agent not found');
    const rep = await reputationDb.getAgentReputation(agentId);
    return success(reply, { agent_id: agentId, ...rep });
  });

  fastify.get('/services/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                service_id: { type: 'string' },
                total_calls: { type: 'integer' },
                success_calls: { type: 'integer' },
                success_rate: { type: 'number' },
                avg_latency: { type: ['number', 'null'] },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const serviceId = request.params.id;
    const service = await servicesDb.getById(serviceId);
    if (!service) return notFound(reply, 'Service not found');
    const rep = await reputationDb.getServiceReputation(serviceId);
    return success(reply, { service_id: serviceId, ...rep });
  });
}

module.exports = reputationRoutes;
