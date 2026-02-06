'use strict';

const http = require('http');
const https = require('https');
const config = require('../config');
const { withTransaction } = require('../db/index');
const walletsDb = require('../db/wallets');
const servicesDb = require('../db/services');
const executionsDb = require('../db/executions');
const { created, success, list } = require('../lib/responses');
const { badRequest, notFound, forbidden, unauthorized, conflict, gone } = require('../lib/errors');
const { validateWebhookUrl } = require('../lib/security/webhookValidation');
const { recordFailure, recordSuccess } = require('../lib/security/circuitBreaker');
const { securityLog } = require('../lib/security/securityLog');
const { createRateLimitPreHandler } = require('../lib/security/rateLimit');
const DEFAULT_COIN = 'AGOTEST';

const timeoutMs = config.serviceWebhookTimeoutMs || 30000;
const maxBytes = config.serviceWebhookMaxBytes || 1024 * 1024;

/** POST to webhook with timeout, max response size, and Content-Type: application/json. */
function httpRequest(webhookUrl, body, timeoutMsVal, maxBytesVal, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(webhookUrl);
    const isHttps = u.protocol === 'https:';
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    const bodyStr = JSON.stringify(body || {});
    if (Buffer.byteLength(bodyStr, 'utf8') > maxBytesVal) {
      return reject(new Error('Request body exceeds max size'));
    }
    const options = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers,
    };
    const req = (isHttps ? https : http).request(options, (res) => {
      const chunks = [];
      let totalLength = 0;
      res.on('data', (chunk) => {
        totalLength += chunk.length;
        if (totalLength > maxBytesVal) {
          req.destroy();
          return reject(new Error('Response exceeds max size'));
        }
        chunks.push(chunk);
      });
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
    req.setTimeout(timeoutMsVal, () => {
      req.destroy();
      reject(new Error('Webhook timeout'));
    });
    req.write(bodyStr);
    req.end();
  });
}

async function executionsRoutes(fastify, opts) {
  const requireAuth = opts.requireAgentAuth;
  if (!requireAuth) {
    throw new Error('executionsRoutes requires requireAgentAuth');
  }

  const baseUrl = config.agoraPublicUrl || `http://localhost:${config.port || 3000}`;

  const rateLimitByAgent = createRateLimitPreHandler({ scope: 'agent', keyPrefix: 'execute' });

  fastify.post('/execute', {
    preHandler: [requireAuth, rateLimitByAgent],
    schema: {
      tags: ['Executions'],
      description: 'Execute a service: debit requester, call service webhook (with X-Url-Callback and X-Callback-Token) and return immediately with status awaiting_callback. Optional X-Idempotency-Key or body idempotency_key for idempotent execution. Result comes via POST /executions/:uuid (callback) or GET /executions/:uuid.',
      headers: {
        type: 'object',
        properties: {
          'X-Idempotency-Key': { type: 'string', description: 'Optional idempotency key; duplicate (agent+service+key) returns original result without re-debiting.' },
        },
      },
      body: {
        type: 'object',
        required: ['service_id', 'request'],
        properties: {
          service_id: { type: 'string', format: 'uuid' },
          request: { type: 'object', description: 'Payload sent to the service webhook' },
          idempotency_key: { type: 'string', description: 'Optional; same semantics as X-Idempotency-Key header.' },
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
                id: { type: 'integer' },
                uuid: { type: 'string', format: 'uuid' },
                requester_agent_id: { type: 'string', format: 'uuid' },
                service_id: { type: 'string', format: 'uuid' },
                status: { type: 'string', description: 'pending | awaiting_callback | success | failed' },
                request: { type: ['object', 'null'], additionalProperties: true },
                response: { type: 'object', nullable: true },
                latency_ms: { type: 'integer', nullable: true },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        429: { type: 'object', properties: { ok: { type: 'boolean' }, code: { type: 'string' }, message: { type: 'string' } }, description: 'Rate limit exceeded' },
      },
    },
  }, async (request, reply) => {
    const requesterAgentId = request.agentId;
    const body = request.body || {};
    const { service_id: serviceId, request: requestPayload } = body;
    const idempotencyKey = request.headers['x-idempotency-key'] || body.idempotency_key || null;

    if (!serviceId) return badRequest(reply, 'service_id is required');

    const service = await servicesDb.getById(serviceId);
    if (!service) return notFound(reply, 'Service not found');
    if (service.status !== 'active') {
      return badRequest(reply, 'Service is not active');
    }

    const price = Number(service.price_cents) || 0;
    const coin = (service.coin || DEFAULT_COIN).toString().slice(0, 16);

    let executionRow;
    const existing = idempotencyKey
      ? await executionsDb.findByIdempotencyReadOnly(requesterAgentId, serviceId, idempotencyKey)
      : null;
    if (existing) {
      request.serviceId = serviceId;
      securityLog(request, 'idempotency_hit', { service_id: serviceId });
      const row = await executionsDb.getById(existing.id);
      return created(reply, row);
    }

    await withTransaction(async (client) => {
      executionRow = await executionsDb.create(client, requesterAgentId, serviceId, requestPayload, idempotencyKey);
      if (price > 0) {
        await walletsDb.debit(client, requesterAgentId, coin, price, {
          service_id: serviceId,
          type: 'execution',
          execution_uuid: executionRow.uuid,
        });
      }
    });

    const validation = await validateWebhookUrl(service.webhook_url);
    if (!validation.ok) {
      request.serviceId = serviceId;
      securityLog(request, 'webhook_blocked_ssrf', { reason: validation.reason, service_id: serviceId });
      const errPayload = { error: 'webhook_blocked_ssrf', message: validation.reason };
      await withTransaction(async (client) => {
        await executionsDb.updateResult(client, executionRow.id, 'failed', errPayload, null);
      });
      const row = await executionsDb.getById(executionRow.id);
      return created(reply, row);
    }

    const ourCallbackUrl = `${baseUrl}/executions/${executionRow.uuid}`;
    httpRequest(
      service.webhook_url,
      requestPayload || {},
      timeoutMs,
      maxBytes,
      {
        'X-Url-Callback': ourCallbackUrl,
        'X-Callback-Token': executionRow.callback_token || '',
      }
    )
      .then((result) => {
        if (result.statusCode >= 200 && result.statusCode < 300) {
          recordSuccess(serviceId);
        } else {
          recordFailure(serviceId).then(({ opened }) => {
            if (opened) {
              servicesDb.update(serviceId, { status: 'paused' });
              securityLog(request, 'circuit_breaker_triggered', { service_id: serviceId });
            }
          });
        }
      })
      .catch(async () => {
        const { opened } = await recordFailure(serviceId);
        if (opened) {
          await servicesDb.update(serviceId, { status: 'paused' });
          securityLog(request, 'circuit_breaker_triggered', { service_id: serviceId });
        }
      });

    await executionsDb.setAwaitingCallback(executionRow.id);
    const row = await executionsDb.getById(executionRow.id);
    return created(reply, row);
  });

  fastify.post('/executions/:uuid', {
    schema: {
      tags: ['Executions'],
      description: 'Callback URL the third-party service must POST to when execution completes. Send X-Callback-Token and JSON body. One valid callback accepted; duplicate callbacks return 409; expired token returns 410.',
      headers: {
        type: 'object',
        properties: {
          'x-callback-token': { type: 'string', description: 'Token from X-Callback-Token when execution was started; required.' },
          'content-type': { type: 'string', description: 'Must be application/json' },
        },
      },
      params: {
        type: 'object',
        required: ['uuid'],
        properties: {
          uuid: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        description: 'Result payload (JSON only). Saved in execution.response.',
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: { type: 'object', additionalProperties: true },
          },
        },
        401: { type: 'object', properties: { ok: { type: 'boolean' }, code: { type: 'string' }, message: { type: 'string' } } },
        409: { type: 'object', properties: { ok: { type: 'boolean' }, code: { type: 'string' }, message: { type: 'string' } }, description: 'Callback already received' },
        410: { type: 'object', properties: { ok: { type: 'boolean' }, code: { type: 'string' }, message: { type: 'string' } }, description: 'Callback token expired' },
        404: { type: 'object', properties: { ok: { type: 'boolean' }, code: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { uuid } = request.params;
    const execution = await executionsDb.getByUuid(uuid);
    if (!execution) return notFound(reply, 'Execution not found');

    if (execution.status === 'success' || execution.status === 'failed') {
      securityLog(request, 'callback_replay', { execution_uuid: uuid });
      return conflict(reply, 'Callback already received');
    }
    if (execution.callback_token_expires_at) {
      const expiresAt = new Date(execution.callback_token_expires_at).getTime();
      if (Date.now() > expiresAt) {
        securityLog(request, 'callback_expired', { execution_uuid: uuid });
        return gone(reply, 'Callback token expired');
      }
    }

    if (execution.status !== 'pending' && execution.status !== 'awaiting_callback') {
      return notFound(reply, 'Execution not found');
    }

    if (execution.callback_token) {
      const token = request.headers['x-callback-token'] || request.headers['X-Callback-Token'];
      if (token !== execution.callback_token) {
        return unauthorized(reply, 'Invalid or missing callback token');
      }
    }

    const service = await servicesDb.getById(execution.service_id);
    if (!service) {
      return reply.code(500).send({ ok: false, code: 'ERROR', message: 'Service not found' });
    }
    const price = Number(service.price_cents) || 0;
    const coin = (service.coin || DEFAULT_COIN).toString().slice(0, 16);

    const body = request.body;
    if (typeof body !== 'object' || body === null) {
      return badRequest(reply, 'JSON body is required');
    }
    const responsePayload = body;
    const successFlag = responsePayload.success === false;
    const hasError = responsePayload.error != null;
    const status = successFlag || hasError ? 'failed' : 'success';
    const createdAt = execution.created_at ? new Date(execution.created_at).getTime() : Date.now();
    const latencyMs = Math.round(Date.now() - createdAt);

    const updated = await withTransaction(async (client) => {
      const ok = await executionsDb.updateResultIfPending(client, execution.id, status, responsePayload, latencyMs);
      if (!ok) return false;
      if (status === 'success' && price > 0) {
        await walletsDb.credit(client, service.owner_agent_id, coin, price, { 
          execution_id: execution.id, 
          execution_uuid: execution.uuid,
          type: 'execution_payment' 
        });
      } else if (status === 'failed' && price > 0) {
        await walletsDb.credit(client, execution.requester_agent_id, coin, price, { 
          execution_id: execution.id, 
          execution_uuid: execution.uuid,
          type: 'refund' 
        });
      }
      return true;
    });

    if (!updated) {
      return notFound(reply, 'Execution not found');
    }
    return reply.code(200).send({ ok: true, data: responsePayload });
  });

  fastify.get('/executions/history', {
    preHandler: requireAuth,
    schema: {
      tags: ['Executions'],
      description: 'List executions for the authenticated agent (requester). Supports filters, limit and pagination.',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'awaiting_callback', 'success', 'failed'], description: 'Filter by execution status' },
          service_id: { type: 'string', format: 'uuid', description: 'Filter by service UUID' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Items per page' },
          offset: { type: 'integer', minimum: 0, default: 0, description: 'Skip N items' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  uuid: { type: 'string', format: 'uuid' },
                  requester_agent_id: { type: 'string', format: 'uuid' },
                  service_id: { type: 'string', format: 'uuid' },
                  status: { type: 'string' },
                  request: { type: ['object', 'null'], additionalProperties: true },
                  response: { type: 'object', nullable: true },
                  latency_ms: { type: 'integer', nullable: true },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                limit: { type: 'integer' },
                offset: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const agentId = request.agentId;
    const filters = {
      status: request.query?.status,
      service_id: request.query?.service_id,
      limit: request.query?.limit ?? 20,
      offset: request.query?.offset ?? 0,
    };
    const { rows, total } = await executionsDb.listByRequester(agentId, filters);
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    return list(reply, rows, { total, limit, offset });
  });

  fastify.get('/executions/:uuid', {
    preHandler: requireAuth,
    schema: {
      tags: ['Executions'],
      description: 'Get execution by UUID (status and full data). Only the requester agent can read.',
      params: {
        type: 'object',
        required: ['uuid'],
        properties: {
          uuid: { type: 'string', format: 'uuid' },
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
                id: { type: 'integer' },
                uuid: { type: 'string', format: 'uuid' },
                requester_agent_id: { type: 'string', format: 'uuid' },
                service_id: { type: 'string', format: 'uuid' },
                status: { type: 'string' },
                request: { type: ['object', 'null'], additionalProperties: true, description: 'Body sent in POST /execute (request field)' },
                response: {
                  oneOf: [
                    { type: 'object', additionalProperties: true },
                    { type: 'string' },
                    { type: 'null' },
                  ],
                  description: 'Callback body saved as-is (JSON or string)',
                },
                latency_ms: { type: 'integer', nullable: true, description: 'Ms from execution created_at to callback received' },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const agentId = request.agentId;
    const { uuid } = request.params;
    const row = await executionsDb.getByUuid(uuid);
    if (!row) return notFound(reply, 'Execution not found');
    if (row.requester_agent_id !== agentId) {
      return forbidden(reply, 'Only the requester can read this execution');
    }
    const { callback_token: _ct, ...publicRow } = row;
    return success(reply, publicRow);
  });
}

module.exports = executionsRoutes;
