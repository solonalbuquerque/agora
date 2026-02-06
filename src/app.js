'use strict';

const fastify = require('fastify')({ logger: true });
const cookie = require('@fastify/cookie');
const cors = require('@fastify/cors');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const config = require('./config');
const routes = require('./routes');
const { getSwaggerAgoraOptions } = require('./swagger-agora-config');
const { attachRequestId } = require('./lib/security/securityLog');

fastify.addHook('onRequest', attachRequestId);
fastify.register(cookie, { secret: config.staffJwtSecret || config.humanJwtSecret || 'cookie-secret' });

// Store raw body for HMAC signature verification (must run before body is parsed)
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    req.rawBody = body;
    const json = body ? JSON.parse(body) : {};
    done(null, json);
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});
fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
  done(null, body || '');
});

fastify.register(cors, { origin: true });

// Disable caching for docs (Swagger UI and spec) so updates show after server restart
fastify.addHook('onRequest', (request, reply, done) => {
  const url = request.url.split('?')[0];
  if (url === '/swagger.json' || url.startsWith('/docs')) {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
  }
  done();
});

fastify.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'AGORA Core API',
      description: 'Agent Grid Open Runtime Architecture — AI Service Hub Core. Agent identity, wallet, service registry, and execution.',
      version: '1.0.0',
    },
    servers: [{ url: `http://localhost:${config.port}`, description: 'Local' }],
    tags: [
      { name: 'Health', description: 'Health check and documentation' },
      { name: 'Agents', description: 'Agent identity (register, me). HMAC auth on protected routes.' },
      { name: 'Wallet', description: 'Balance and transfers. Requires HMAC auth (X-Agent-Id, X-Timestamp, X-Signature).' },
      { name: 'Services', description: 'Service registry (capabilities). HMAC auth to create.' },
      { name: 'Executions', description: 'Execute services (debit, webhook, credit). HMAC auth.' },
      { name: 'Reputation', description: 'Reputation metrics per agent and per service.' },
      { name: 'Human', description: 'Human identity (email), verification, link to agents. JWT for /me and link flow.' },
      { name: 'Admin', description: 'Mint and issuer management. Requires X-Admin-Token header.' },
      { name: 'Faucet', description: 'Self-host faucet. Only active when ENABLE_FAUCET=true.' },
      { name: 'Issuer', description: 'Issuer-signed credit. Headers X-Issuer-Id, X-Issuer-Timestamp, X-Issuer-Signature.' },
      { name: 'Instance', description: 'Instance registration and activation. Status with X-Instance-Token or X-Admin-Token.' },
    ],
  },
});

const swaggerAgora = getSwaggerAgoraOptions();
fastify.register(swaggerUi, {
  routePrefix: '/docs',
  theme: swaggerAgora.theme,
  uiConfig: swaggerAgora.uiConfig,
});

fastify.register(routes);

fastify.addHook('onReady', async () => {
  const trustLevels = require('./lib/trustLevels');
  await trustLevels.loadFromDb();
});

fastify.setErrorHandler((err, request, reply) => {
  request.log.error(err);
  const code = err.statusCode || 500;
  const message = code >= 500 ? 'Internal server error' : (err.message || 'Error');
  reply.code(code).send({ ok: false, code: 'ERROR', message });
});

module.exports = fastify;
