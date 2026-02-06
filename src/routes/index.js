'use strict';

const path = require('path');
const config = require('../config');
const agentsDb = require('../db/agents');
const walletsDb = require('../db/wallets');
const { requireAgentAuth } = require('../lib/auth');
const { success } = require('../lib/responses');
const { getDocIa } = require('../lib/doc-ia');

const staffUiDist = path.join(__dirname, '../../staff-ui/dist');
const pkg = require('../../package.json');
const baseUrl = config.agoraPublicUrl || `http://localhost:${config.port || 3000}`;

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

  fastify.get('/', {
    schema: {
      tags: ['Health'],
      description: 'API discovery for AI: documentation links and system info (e.g. available coins).',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            docs: {
              type: 'object',
              properties: {
                swagger_ui: { type: 'string', description: 'URL to Swagger UI' },
                swagger_spec: { type: 'string', description: 'URL to OpenAPI spec JSON' },
                doc_ia: { type: 'string', description: 'URL to AI-oriented documentation (JSON)' },
              },
            },
            system: {
              type: 'object',
              properties: {
                available_coins: { type: 'array', items: { type: 'string' } },
                service: { type: 'string' },
                version: { type: 'string' },
                default_coin: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    let availableCoins = [];
    try {
      const rows = await walletsDb.listCoins();
      availableCoins = rows.map((r) => r.coin);
    } catch (_err) {
      // Discovery still works with empty coins
    }
    return reply.send({
      ok: true,
      docs: {
        swagger_ui: `${baseUrl}/docs`,
        swagger_spec: `${baseUrl}/swagger.json`,
        doc_ia: `${baseUrl}/doc-ia`,
      },
      system: {
        available_coins: availableCoins,
        service: 'agora-core',
        version: pkg.version || '1.0.0',
        default_coin: config.defaultCoin || 'AGOTEST',
      },
    });
  });

  fastify.get('/doc-ia', {
    schema: {
      tags: ['Health'],
      description: 'Structured documentation for AI: authentication, business rules, how to transact, and JSON Schema types.',
    },
  }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    const doc = getDocIa(baseUrl);
    return reply.send(doc);
  });

  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      description: 'Liveness: process is alive. Does NOT check DB or Redis.',
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

  fastify.get('/ready', {
    schema: {
      tags: ['Observability'],
      description: 'Readiness: DB, Redis (if configured), and migrations. Returns 503 if not ready.',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                checks: {
                  type: 'object',
                  additionalProperties: { type: 'boolean' },
                },
              },
            },
          },
        },
        503: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            code: { type: 'string' },
            checks: {
              type: 'object',
              additionalProperties: { type: 'boolean' },
            },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const db = require('../db/index');
    const config = require('../config');
    const checks = { postgres: false, redis: false, migrations: false };
    try {
      await db.query('SELECT 1', []);
      checks.postgres = true;
    } catch (_) {}
    if (config.redisUrl) {
      try {
        const redis = require('../lib/redis');
        const client = await redis.getRedis();
        if (client) {
          await client.ping();
          checks.redis = true;
        }
      } catch (_) {}
    } else {
      checks.redis = true;
    }
    try {
      const r = await db.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_events'`,
        []
      );
      checks.migrations = r.rows.length > 0;
    } catch (_) {}
    const ready = checks.postgres && checks.redis && checks.migrations;
    if (!ready) {
      return reply.code(503).send({ ok: false, code: 'NOT_READY', checks });
    }
    return reply.send({ ok: true, data: { status: 'ready', checks } });
  });

  fastify.get('/metrics', {
    schema: {
      tags: ['Observability'],
      description: 'Prometheus-style metrics (when ENABLE_METRICS=true).',
    },
  }, async (_request, reply) => {
    const config = require('../config');
    if (!config.enableMetrics) {
      return reply.code(404).send({ ok: false, code: 'DISABLED', message: 'Metrics disabled' });
    }
    const metrics = require('../lib/metrics');
    const db = require('../db/index');
    let ledgerBalances = {};
    try {
      const res = await db.query('SELECT coin, COALESCE(SUM(balance_cents), 0)::bigint AS total FROM wallets GROUP BY coin', []);
      res.rows.forEach((r) => { ledgerBalances[r.coin] = Number(r.total); });
    } catch (_) {}
    const body = metrics.exportPrometheus(ledgerBalances);
    return reply.header('Content-Type', 'text/plain; charset=utf-8').send(body);
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
