'use strict';

const servicesDb = require('../db/services');
const { created, success, list } = require('../lib/responses');
const { badRequest, notFound } = require('../lib/errors');

async function servicesRoutes(fastify, opts) {
  const requireAuth = opts.requireAgentAuth;
  if (!requireAuth) {
    throw new Error('servicesRoutes requires requireAgentAuth');
  }

  fastify.post('/', {
    preHandler: requireAuth,
    schema: {
      description: 'Register a new service (capability) owned by the authenticated agent.',
      body: {
        type: 'object',
        required: ['name', 'webhook_url'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          webhook_url: { type: 'string', format: 'uri' },
          input_schema: { type: 'object' },
          output_schema: { type: 'object' },
          price_cents_usd: { type: 'integer', minimum: 0 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const ownerAgentId = request.agentId;
    const body = request.body || {};
    if (!body.name || !body.webhook_url) {
      return badRequest(reply, 'name and webhook_url are required');
    }
    const service = await servicesDb.create({
      owner_agent_id: ownerAgentId,
      name: body.name,
      description: body.description,
      webhook_url: body.webhook_url,
      input_schema: body.input_schema,
      output_schema: body.output_schema,
      price_cents_usd: body.price_cents_usd || 0,
    });
    return created(reply, service);
  });

  fastify.get('/', {
    schema: {
      description: 'List services, optionally filtered by status and owner.',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          owner_agent_id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: { type: 'array' },
            meta: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const filters = {};
    if (request.query?.status) filters.status = request.query.status;
    if (request.query?.owner_agent_id) filters.owner_agent_id = request.query.owner_agent_id;
    const rows = await servicesDb.list(filters);
    return list(reply, rows, { total: rows.length });
  });

  fastify.get('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } },
      },
    },
  }, async (request, reply) => {
    const service = await servicesDb.getById(request.params.id);
    if (!service) return notFound(reply, 'Service not found');
    return success(reply, service);
  });
}

module.exports = servicesRoutes;
