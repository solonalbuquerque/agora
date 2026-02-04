'use strict';

const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const config = require('./config');
const routes = require('./routes');
const { getSwaggerAgoraOptions } = require('./swagger-agora-config');

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

fastify.register(cors, { origin: true });

fastify.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'AGORA Core API',
      description: 'Agent Grid Open Runtime Architecture — AI Service Hub Core. Agent identity, wallet, service registry, and execution.',
      version: '1.0.0',
    },
    servers: [{ url: `http://localhost:${config.port}`, description: 'Local' }],
  },
});

const swaggerAgora = getSwaggerAgoraOptions();
fastify.register(swaggerUi, {
  routePrefix: '/docs',
  theme: swaggerAgora.theme,
  uiConfig: swaggerAgora.uiConfig,
});

fastify.register(routes);

fastify.setErrorHandler((err, request, reply) => {
  request.log.error(err);
  const code = err.statusCode || 500;
  const message = code >= 500 ? 'Internal server error' : (err.message || 'Error');
  reply.code(code).send({ ok: false, code: 'ERROR', message });
});

module.exports = fastify;
