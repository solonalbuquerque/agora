'use strict';

const humansDb = require('../db/humans');
const agentsDb = require('../db/agents');
const { created, success } = require('../lib/responses');
const { badRequest, unauthorized, forbidden } = require('../lib/errors');
const config = require('../config');
const { requireHumanAuth, sign } = require('../lib/humanAuth');
const { setNonce, getAndDelNonce } = require('../lib/redis');
const crypto = require('crypto');

async function humanRoutes(fastify) {
  fastify.post('/register', {
    schema: {
      tags: ['Human'],
      description: 'Register a human by email. Sends verification (stub); in dev may return token.',
      body: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                human_id: { type: 'string', format: 'uuid' },
                status: { type: 'string' },
                token: { type: 'string', description: 'Only when HUMAN_EMAIL_DEV_RETURN_TOKEN=true' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const email = request.body?.email;
    if (!email || typeof email !== 'string') return badRequest(reply, 'email is required');
    const human = await humansDb.createHuman(email);
    const { token, expiresAt } = await humansDb.createVerification(human.id);
    const data = { human_id: human.id, status: human.status };
    if (config.humanEmailDevReturnToken) data.token = token;
    return created(reply, data);
  });

  fastify.post('/verify', {
    schema: {
      tags: ['Human'],
      description: 'Verify email with one-time token. Marks human as verified.',
      body: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                human_id: { type: 'string', format: 'uuid' },
                status: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const token = request.body?.token;
    if (!token) return badRequest(reply, 'token is required');
    const humanId = await humansDb.consumeVerification(token);
    if (!humanId) return badRequest(reply, 'Invalid or expired token');
    const human = await humansDb.getHumanById(humanId);
    const data = { human_id: human.id, status: human.status };
    if (config.humanJwtSecret) data.jwt = sign({ human_id: human.id });
    return success(reply, data);
  });

  fastify.post('/login', {
    schema: {
      tags: ['Human'],
      description: 'Exchange verification token for JWT (optional). Requires HUMAN_JWT_SECRET.',
      body: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                human_id: { type: 'string', format: 'uuid' },
                status: { type: 'string' },
                jwt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const token = request.body?.token;
    if (!token) return badRequest(reply, 'token is required');
    const humanId = await humansDb.consumeVerification(token);
    if (!humanId) return badRequest(reply, 'Invalid or expired token');
    const human = await humansDb.getHumanById(humanId);
    if (!config.humanJwtSecret) return success(reply, { human_id: human.id, status: human.status });
    const jwt = sign({ human_id: human.id });
    return success(reply, { human_id: human.id, status: human.status, jwt });
  });

  fastify.get('/me', {
    preHandler: config.humanJwtSecret ? requireHumanAuth() : [],
    schema: {
      tags: ['Human'],
      description: 'Current human (requires JWT when HUMAN_JWT_SECRET is set).',
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } },
    },
  }, async (request, reply) => {
    if (!config.humanJwtSecret) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Human auth not configured' });
    const human = await humansDb.getHumanById(request.humanId);
    if (!human) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Human not found' });
    return success(reply, human);
  });

  fastify.get('/me/agents', {
    preHandler: config.humanJwtSecret ? requireHumanAuth() : [],
    schema: {
      tags: ['Human'],
      description: 'List agents linked to the authenticated human.',
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'array' } } } },
    },
  }, async (request, reply) => {
    if (!config.humanJwtSecret) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Human auth not configured' });
    const agents = await humansDb.getAgentsByHumanId(request.humanId);
    return success(reply, agents);
  });

  const requireHuman = config.humanJwtSecret ? requireHumanAuth() : [];

  fastify.post('/link-challenge', {
    preHandler: requireHuman,
    schema: {
      tags: ['Human'],
      description: 'Request a nonce to prove agent possession. Use nonce + HMAC(agent_secret, nonce) in link-agent.',
      body: {
        type: 'object',
        required: ['agent_id'],
        properties: { agent_id: { type: 'string' } },
      },
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object', properties: { nonce: { type: 'string' } } } } } },
    },
  }, async (request, reply) => {
    if (!config.humanJwtSecret) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Human auth not configured' });
    const agentId = request.body?.agent_id;
    if (!agentId) return badRequest(reply, 'agent_id is required');
    const nonce = crypto.randomBytes(24).toString('hex');
    const key = `link:${request.humanId}:${agentId}`;
    await setNonce(key, nonce, 300);
    return success(reply, { nonce });
  });

  fastify.post('/link-agent', {
    preHandler: requireHuman,
    schema: {
      tags: ['Human'],
      description: 'Link agent to human: provide nonce from link-challenge and agent_signature = HMAC(agent_secret, nonce) in hex. Or (if ALLOW_INSECURE_LINK=true) agent_secret in body.',
      body: {
        type: 'object',
        required: ['agent_id'],
        properties: {
          agent_id: { type: 'string' },
          nonce: { type: 'string' },
          agent_signature: { type: 'string' },
          agent_secret: { type: 'string' },
        },
      },
      response: { 201: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } },
    },
  }, async (request, reply) => {
    if (!config.humanJwtSecret) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Human auth not configured' });
    const { agent_id: agentId, nonce, agent_signature: agentSignature, agent_secret: agentSecret } = request.body || {};
    if (!agentId) return badRequest(reply, 'agent_id is required');

    if (config.allowInsecureLink && agentSecret) {
      const secret = await agentsDb.getSecretById(agentId);
      if (!secret || secret !== agentSecret) return unauthorized(reply, 'Invalid agent_secret');
      await humansDb.linkAgent(request.humanId, agentId, 'owner');
      return created(reply, { human_id: request.humanId, agent_id: agentId, role: 'owner' });
    }

    if (!nonce || !agentSignature) return badRequest(reply, 'nonce and agent_signature are required (or agent_secret when ALLOW_INSECURE_LINK=true)');
    const key = `link:${request.humanId}:${agentId}`;
    const storedNonce = await getAndDelNonce(key);
    if (!storedNonce || storedNonce !== nonce) return forbidden(reply, 'Invalid or expired nonce');
    const secret = await agentsDb.getSecretById(agentId);
    if (!secret) return unauthorized(reply, 'Agent not found');
    const expectedSig = crypto.createHmac('sha256', secret).update(nonce, 'utf8').digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(agentSignature, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return unauthorized(reply, 'Invalid agent signature');
    }
    await humansDb.linkAgent(request.humanId, agentId, 'owner');
    return created(reply, { human_id: request.humanId, agent_id: agentId, role: 'owner' });
  });
}

module.exports = humanRoutes;
