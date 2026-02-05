'use strict';

const servicesDb = require('../db/services');
const walletsDb = require('../db/wallets');
const { created, success, list } = require('../lib/responses');
const { badRequest, notFound, forbidden } = require('../lib/errors');
const { formatMoney } = require('../lib/money');

async function servicesRoutes(fastify, opts) {
  const requireAuth = opts.requireAgentAuth;
  if (!requireAuth) {
    throw new Error('servicesRoutes requires requireAgentAuth');
  }

  fastify.post('/', {
    preHandler: requireAuth,
    schema: {
      tags: ['Services'],
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
          price_cents: { type: 'integer', minimum: 0 },
          coin: { type: 'string', maxLength: 16 },
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
                owner_agent_id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                webhook_url: { type: 'string', format: 'uri' },
                input_schema: { type: 'object', nullable: true },
                output_schema: { type: 'object', nullable: true },
                price_cents: { type: 'integer' },
                price_formated: { type: 'string' },
                coin: { type: 'string' },
                status: { type: 'string' },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
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
      price_cents: body.price_cents ?? 0,
      coin: body.coin || 'AGOTEST',
    });
    const coinCfg = await walletsDb.getCoin(service.coin);
    const coinsMap = coinCfg ? { [coinCfg.coin]: coinCfg } : {};
    return created(reply, { ...service, price_formated: formatMoney(service.price_cents, service.coin, coinsMap) });
  });

  fastify.get('/', {
    schema: {
      tags: ['Services'],
      description: 'List services. Default shows only active; use status to include paused/removed. Filters: owner, coin, text search (name, description, input_schema).',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          owner_agent_id: { type: 'string', format: 'uuid' },
          coin: { type: 'string', maxLength: 16, description: 'Filter by coin (e.g. AGOTEST)' },
          q: { type: 'string', description: 'Search in name, description and input_schema (case-insensitive contains)' },
        },
      },
    },
  }, async (request, reply) => {
    const filters = {};
    if (request.query?.status) filters.status = request.query.status;
    if (request.query?.owner_agent_id) filters.owner_agent_id = request.query.owner_agent_id;
    if (request.query?.coin) filters.coin = (request.query.coin || '').toString().slice(0, 16).toUpperCase();
    if (request.query?.q != null && request.query.q !== '') filters.q = request.query.q;
    const result = await servicesDb.list(filters);
    const rows = Array.isArray(result?.rows) ? result.rows : (Array.isArray(result) ? result : []);
    const coins = await walletsDb.listCoins();
    const coinsMap = {};
    for (const c of coins) coinsMap[c.coin] = c;
    const formattedRows = rows.map((r) => ({
      ...r,
      price_formated: formatMoney(r.price_cents, r.coin, coinsMap),
    }));
    const total = Number(result?.total) || rows.length;
    return list(reply, formattedRows, { total });
  });

  fastify.get('/:id', {
    schema: {
      tags: ['Services'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                owner_agent_id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                webhook_url: { type: 'string', format: 'uri' },
                input_schema: { type: 'object', nullable: true },
                output_schema: { type: 'object', nullable: true },
                price_cents: { type: 'integer' },
                price_formated: { type: 'string' },
                coin: { type: 'string' },
                status: { type: 'string' },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const service = await servicesDb.getById(request.params.id);
    if (!service) return notFound(reply, 'Service not found');
    const coinCfg = await walletsDb.getCoin(service.coin);
    const coinsMap = coinCfg ? { [coinCfg.coin]: coinCfg } : {};
    return success(reply, { ...service, price_formated: formatMoney(service.price_cents, service.coin, coinsMap) });
  });

  const serviceDataSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      owner_agent_id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      webhook_url: { type: 'string', format: 'uri' },
      input_schema: { type: 'object', nullable: true },
      output_schema: { type: 'object', nullable: true },
      price_cents: { type: 'integer' },
      price_formated: { type: 'string' },
      coin: { type: 'string' },
      status: { type: 'string', enum: ['active', 'paused', 'removed'] },
      created_at: { type: 'string', format: 'date-time' },
    },
  };

  fastify.put('/:id', {
    preHandler: requireAuth,
    schema: {
      tags: ['Services'],
      description: 'Update a service. Only the owner can update. Set status to paused or removed to inactivate (inactive services do not appear in default list).',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          webhook_url: { type: 'string', format: 'uri' },
          input_schema: { type: 'object' },
          output_schema: { type: 'object' },
          price_cents: { type: 'integer', minimum: 0 },
          coin: { type: 'string', maxLength: 16 },
          status: { type: 'string', enum: ['active', 'paused', 'removed'], description: 'paused or removed = inactive, not listed by default' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: serviceDataSchema,
          },
        },
      },
    },
  }, async (request, reply) => {
    const agentId = request.agentId;
    const { id } = request.params;
    const service = await servicesDb.getById(id);
    if (!service) return notFound(reply, 'Service not found');
    if (service.owner_agent_id !== agentId) {
      return forbidden(reply, 'Only the owner can update this service');
    }
    const body = request.body || {};
    const updated = await servicesDb.update(id, {
      name: body.name,
      description: body.description,
      webhook_url: body.webhook_url,
      input_schema: body.input_schema,
      output_schema: body.output_schema,
      price_cents: body.price_cents,
      coin: body.coin,
      status: body.status,
    });
    const coinCfg = await walletsDb.getCoin(updated.coin);
    const coinsMap = coinCfg ? { [coinCfg.coin]: coinCfg } : {};
    return success(reply, { ...updated, price_formated: formatMoney(updated.price_cents, updated.coin, coinsMap) });
  });
}

module.exports = servicesRoutes;
