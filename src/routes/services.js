'use strict';

const config = require('../config');
const servicesDb = require('../db/services');
const walletsDb = require('../db/wallets');
const agentsDb = require('../db/agents');
const staffSettingsDb = require('../db/staffSettings');
const { created, success, list } = require('../lib/responses');
const { badRequest, notFound, forbidden } = require('../lib/errors');
const { formatMoney } = require('../lib/money');
const { getAllowPaidServices } = require('../lib/trustLevels');
const compliance = require('../lib/compliance');
const { recordAuditEvent } = require('../lib/audit');
const { validateWebhookUrl } = require('../lib/security/webhookValidation');

async function servicesRoutes(fastify, opts) {
  const requireAuth = opts.requireAgentAuth;
  if (!requireAuth) {
    throw new Error('servicesRoutes requires requireAgentAuth');
  }

  /** PreHandler for execute-from-central: require X-Central-Secret when config.agoraCenterExecuteSecret is set. */
  function centralExecuteAuth(request, reply, done) {
    const secret = config.agoraCenterExecuteSecret;
    if (secret) {
      const headerSecret = request.headers['x-central-secret'];
      if (headerSecret !== secret) {
        const err = Object.assign(new Error('Invalid or missing X-Central-Secret'), { statusCode: 401 });
        return done(err);
      }
    }
    done();
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
          export: { type: 'boolean', default: false },
          slug: { type: ['string', 'null'], description: 'Unique slug for this service within the instance (optional).' },
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
                slug: { type: ['string', 'null'] },
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
    const globalCanRegister = (await staffSettingsDb.get('bots_can_register_services')) !== 'false';
    const agent = await agentsDb.getById(ownerAgentId);
    const canRegister = agent?.can_register_services === true ? true : agent?.can_register_services === false ? false : null;
    if (canRegister === false) {
      return forbidden(reply, 'Your agent is not allowed to register services.');
    }
    if (!globalCanRegister && canRegister !== true) {
      return forbidden(reply, 'Bots are not allowed to register services on this instance.');
    }
    if (body.slug !== undefined && body.slug !== null && !servicesDb.isValidSlug(body.slug)) {
      return badRequest(reply, 'Invalid slug: use only lowercase letters, numbers and hyphens; max 64 characters.');
    }
    const priceCents = body.price_cents ?? 0;
    const wantExport = body.export === true;
    if (priceCents > 0) {
      const owner = await agentsDb.getById(ownerAgentId);
      const trustLevel = owner ? (owner.trust_level ?? 0) : 0;
      if (!getAllowPaidServices(trustLevel)) {
        return forbidden(reply, 'Your trust level does not allow publishing paid services. Reach Verified (level 1) or higher.');
      }
    }
    if (wantExport) {
      const allowed = await compliance.requireCompliantForExports(reply);
      if (!allowed) return;
    }
    const service = await servicesDb.create({
      owner_agent_id: ownerAgentId,
      name: body.name,
      description: body.description,
      webhook_url: body.webhook_url,
      input_schema: body.input_schema,
      output_schema: body.output_schema,
      price_cents: priceCents,
      coin: body.coin || 'AGOTEST',
      export: wantExport,
      slug: body.slug,
    });
    if (wantExport) {
      await recordAuditEvent({
        event_type: 'SERVICE_EXPORT_ENABLED',
        actor_type: 'admin',
        target_type: 'service',
        target_id: service.id,
        metadata: { name: service.name },
        request_id: request.requestId,
      });
    }
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

  fastify.patch('/:id/export', {
    preHandler: requireAuth,
    schema: {
      tags: ['Services'],
      description: 'Enable or disable service export. Only owner. Export requires instance compliant and export_services_enabled.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['export'],
        properties: { export: { type: 'boolean' } },
      },
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' }, data: serviceDataSchema } },
        403: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const agentId = request.agentId;
    const { id } = request.params;
    const service = await servicesDb.getById(id);
    if (!service) return notFound(reply, 'Service not found');
    if (service.owner_agent_id !== agentId) return forbidden(reply, 'Only the owner can change export');
    const wantExport = request.body?.export === true;
    if (wantExport) {
      const allowed = await compliance.requireCompliantForExports(reply);
      if (!allowed) return;
    }
    const updated = await servicesDb.setExport(id, wantExport);
    await recordAuditEvent({
      event_type: wantExport ? 'SERVICE_EXPORT_ENABLED' : 'SERVICE_EXPORT_DISABLED',
      actor_type: 'admin',
      target_type: 'service',
      target_id: id,
      metadata: { name: updated.name },
      request_id: request.requestId,
    });
    const coinCfg = await walletsDb.getCoin(updated.coin);
    const coinsMap = coinCfg ? { [coinCfg.coin]: coinCfg } : {};
    return success(reply, { ...updated, price_formated: formatMoney(updated.price_cents, updated.coin, coinsMap) });
  });

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
          slug: { type: ['string', 'null'], description: 'Unique slug for this service (set null to clear).' },
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
    if (body.slug !== undefined && body.slug !== null && !servicesDb.isValidSlug(body.slug)) {
      return badRequest(reply, 'Invalid slug: use only lowercase letters, numbers and hyphens; max 64 characters.');
    }
    const newPriceCents = body.price_cents !== undefined ? body.price_cents : service.price_cents;
    if (newPriceCents > 0) {
      const owner = await agentsDb.getById(agentId);
      const trustLevel = owner ? (owner.trust_level ?? 0) : 0;
      if (!getAllowPaidServices(trustLevel)) {
        return forbidden(reply, 'Your trust level does not allow publishing paid services. Reach Verified (level 1) or higher.');
      }
    }
    const updated = await servicesDb.update(id, {
      name: body.name,
      description: body.description,
      webhook_url: body.webhook_url,
      input_schema: body.input_schema,
      output_schema: body.output_schema,
      price_cents: body.price_cents,
      coin: body.coin,
      status: body.status,
      slug: body.slug,
    });
    const coinCfg = await walletsDb.getCoin(updated.coin);
    const coinsMap = coinCfg ? { [coinCfg.coin]: coinCfg } : {};
    return success(reply, { ...updated, price_formated: formatMoney(updated.price_cents, updated.coin, coinsMap) });
  });

  fastify.post('/:service_ref/execute-from-central', {
    preHandler: [centralExecuteAuth],
    schema: {
      tags: ['Services'],
      description: 'Execute a service on behalf of the Central (payment already settled at Center). Requires X-Central-Secret when AGORA_CENTER_EXECUTE_SECRET is set.',
      params: { type: 'object', properties: { service_ref: { type: 'string' } } },
      body: {
        type: 'object',
        properties: { payload: { type: 'object' } },
      },
      response: { 200: { type: 'object' }, 400: { type: 'object' }, 401: { type: 'object' }, 404: { type: 'object' } },
    },
  }, async (request, reply) => {
    const serviceRef = request.params.service_ref;
    const { payload } = request.body || {};
    const service = await servicesDb.getByIdOrSlug(serviceRef);
    if (!service) return notFound(reply, 'Service not found');
    if (service.status !== 'active') return badRequest(reply, 'Service is not active');
    if (!service.webhook_url) return badRequest(reply, 'Service has no webhook_url');

    const validation = await validateWebhookUrl(service.webhook_url);
    if (!validation.ok) {
      return reply.code(400).send({ ok: false, code: 'WEBHOOK_BLOCKED', message: validation.reason || 'Webhook URL not allowed' });
    }

    const timeoutMs = config.serviceWebhookTimeoutMs || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(service.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Central-Order-Id': request.headers['x-central-order-id'] || '',
          'X-From-Instance-Id': request.headers['x-from-instance-id'] || '',
          'X-From-Agent-Ref': request.headers['x-from-agent-ref'] || '',
        },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {
        data = { raw: text };
      }
      return reply.code(res.status).send(data);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return reply.code(504).send({ ok: false, code: 'WEBHOOK_TIMEOUT', message: 'Service webhook timeout' });
      }
      throw err;
    }
  });
}

module.exports = servicesRoutes;
