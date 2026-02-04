'use strict';

const http = require('http');
const https = require('https');
const { withTransaction } = require('../db/index');
const walletsDb = require('../db/wallets');
const servicesDb = require('../db/services');
const executionsDb = require('../db/executions');
const { created } = require('../lib/responses');
const { badRequest, notFound } = require('../lib/errors');

const DEFAULT_COIN = 'USD';

function httpRequest(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const options = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };
    const req = (isHttps ? https : http).request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (_) {
          parsed = data;
        }
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Webhook timeout'));
    });
    req.write(JSON.stringify(body || {}));
    req.end();
  });
}

async function executionsRoutes(fastify, opts) {
  const requireAuth = opts.requireAgentAuth;
  if (!requireAuth) {
    throw new Error('executionsRoutes requires requireAgentAuth');
  }

  fastify.post('/execute', {
    preHandler: requireAuth,
    schema: {
      description: 'Execute a service: debit requester, call webhook, credit owner on success.',
      body: {
        type: 'object',
        required: ['service_id', 'request'],
        properties: {
          service_id: { type: 'string', format: 'uuid' },
          request: { type: 'object', description: 'Payload sent to the service webhook' },
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
    const requesterAgentId = request.agentId;
    const { service_id: serviceId, request: requestPayload } = request.body || {};
    if (!serviceId) {
      return badRequest(reply, 'service_id is required');
    }
    const service = await servicesDb.getById(serviceId);
    if (!service) {
      return notFound(reply, 'Service not found');
    }
    if (service.status !== 'active') {
      return badRequest(reply, 'Service is not active');
    }
    const price = Number(service.price_cents_usd) || 0;
    const coin = DEFAULT_COIN;

    let executionRow;
    await withTransaction(async (client) => {
      if (price > 0) {
        await walletsDb.debit(client, requesterAgentId, coin, price, { service_id: serviceId, type: 'execution' });
      }
      executionRow = await executionsDb.create(client, requesterAgentId, serviceId, requestPayload);
    });

    const start = Date.now();
    let webhookSuccess = false;
    let responsePayload = null;
    try {
      const res = await httpRequest(service.webhook_url, requestPayload || {});
      webhookSuccess = res.statusCode >= 200 && res.statusCode < 300;
      responsePayload = res.body;
    } catch (err) {
      responsePayload = { error: err.message };
    }
    const latencyMs = Date.now() - start;

    await withTransaction(async (client) => {
      if (webhookSuccess) {
        if (price > 0) {
          await walletsDb.credit(client, service.owner_agent_id, coin, price, { execution_id: executionRow.id, type: 'execution_payment' });
        }
        await executionsDb.updateResult(client, executionRow.id, 'success', responsePayload, latencyMs);
      } else {
        if (price > 0) {
          await walletsDb.credit(client, requesterAgentId, coin, price, { execution_id: executionRow.id, type: 'refund' });
        }
        await executionsDb.updateResult(client, executionRow.id, 'failed', responsePayload, latencyMs);
      }
    });

    const result = await executionsDb.getById(executionRow.id);
    return created(reply, result);
  });
}

module.exports = executionsRoutes;
