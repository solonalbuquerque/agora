'use strict';

const crypto = require('crypto');
const config = require('../config');
const { query, withTransaction } = require('../db/index');
const agentsDb = require('../db/agents');
const humansDb = require('../db/humans');
const walletsDb = require('../db/wallets');
const issuersDb = require('../db/issuers');
const executionsDb = require('../db/executions');
const servicesDb = require('../db/services');
const staffSettingsDb = require('../db/staffSettings');
const { created, success } = require('../lib/responses');
const { badRequest, conflict } = require('../lib/errors');
const { requireStaff, sign, sign2faPending, verify2faPending } = require('../lib/staffAuth');
const { getTotpSecret, generateSecret, generateOtpauthUrl, verifyToken } = require('../lib/totp');

function staffPreHandler(request, reply, done) {
  const path = request.routerPath || request.url.split('?')[0];
  const method = request.method;
  
  // Rotas públicas: POST de login e rotas de 2FA
  const isPublicPost = (path === '/staff/login' || path === '/staff/login/2fa' || path === '/staff/logout' || path.startsWith('/staff/2fa/setup')) && method === 'POST';
  
  // GET para UI (index.html e assets): permitir acesso para React Router gerenciar autenticação no cliente
  const isPublicGet = method === 'GET' && (path === '/staff' || path === '/staff/' || (!path.startsWith('/staff/api/') && !path.startsWith('/staff/assets/')));
  
  if (isPublicPost || isPublicGet) return done();
  return requireStaff(request, reply, done);
}

async function staffRoutes(fastify, opts) {
  fastify.addHook('preHandler', staffPreHandler);

  // --- Auth routes (no token required) ---
  fastify.post('/login', {
    schema: {
      tags: ['Staff'],
      description: 'Staff login with password. Returns require2fa if 2FA is enabled.',
      body: {
        type: 'object',
        required: ['password'],
        properties: { password: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            require2fa: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!config.staffPassword) {
      return reply.code(503).send({ ok: false, code: 'STAFF_DISABLED', message: 'Staff login not configured' });
    }
    const { password } = request.body || {};
    const pw = (password || '').toString();
    if (pw.length !== config.staffPassword.length || !crypto.timingSafeEqual(Buffer.from(config.staffPassword, 'utf8'), Buffer.from(pw, 'utf8'))) {
      return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid password' });
    }
    if (config.staff2faEnabled) {
      const secret = await getTotpSecret();
      if (secret) {
        const pendingJwt = sign2faPending();
        reply.setCookie('staff_2fa_pending', pendingJwt, {
          path: '/',
          httpOnly: true,
          maxAge: 2 * 60, // 2 min
          sameSite: 'lax',
        });
        return reply.send({ ok: true, require2fa: true });
      }
    }
    const jwt = sign();
    reply.setCookie('staff_session', jwt, { path: '/', httpOnly: true, maxAge: 8 * 60 * 60, sameSite: 'lax' });
    return reply.send({ ok: true });
  });

  fastify.post('/login/2fa', {
    schema: {
      tags: ['Staff'],
      description: 'Second factor: verify TOTP code after password.',
      body: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string' } },
      },
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
    },
  }, async (request, reply) => {
    const pending = request.cookies?.staff_2fa_pending;
    if (!verify2faPending(pending)) {
      reply.clearCookie('staff_2fa_pending', { path: '/' });
      return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    }
    const secret = await getTotpSecret();
    if (!secret) {
      reply.clearCookie('staff_2fa_pending', { path: '/' });
      return reply.code(503).send({ ok: false, code: '2FA_NOT_CONFIGURED', message: '2FA not configured' });
    }
    const { code } = request.body || {};
    if (!(await verifyToken(code, secret))) {
      return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid 2FA code' });
    }
    reply.clearCookie('staff_2fa_pending', { path: '/' });
    const jwt = sign();
    reply.setCookie('staff_session', jwt, { path: '/', httpOnly: true, maxAge: 8 * 60 * 60, sameSite: 'lax' });
    return reply.send({ ok: true });
  });

  fastify.post('/logout', {
    schema: { tags: ['Staff'], description: 'Clear staff session.', response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } } },
  }, async (_request, reply) => {
    reply.clearCookie('staff_session', { path: '/' });
    reply.clearCookie('staff_2fa_pending', { path: '/' });
    return reply.send({ ok: true });
  });

  // --- Protected routes ---
  fastify.post('/mint', {
    schema: {
      tags: ['Staff'],
      description: 'Mint (credit) balance to an agent. Idempotent when external_ref is provided.',
      headers: {
        type: 'object',
        properties: {
          'X-Staff-Token': { type: 'string' },
          'X-Admin-Token': { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['agent_id', 'coin', 'amount_cents'],
        properties: {
          agent_id: { type: 'string' },
          coin: { type: 'string', maxLength: 16 },
          amount_cents: { type: 'integer', minimum: 1 },
          external_ref: { type: 'string' },
          reason: { type: 'string' },
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
                agent_id: { type: 'string' },
                coin: { type: 'string' },
                amount_cents: { type: 'integer' },
                ledger_id: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { agent_id: agentId, coin, amount_cents: amountCents, external_ref: externalRef, reason } = request.body || {};
    if (!agentId || !coin || amountCents == null || amountCents < 1) {
      return badRequest(reply, 'agent_id, coin, and amount_cents (positive) are required');
    }
    // Verificar se o agent existe antes de tentar criar a wallet
    const agentCheck = await query('SELECT id FROM agents WHERE id = $1', [agentId]);
    if (agentCheck.rows.length === 0) {
      return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: `Agent ${agentId} not found` });
    }
    const coinNorm = coin.toString().slice(0, 16).toUpperCase();
    if (externalRef) {
      const exists = await walletsDb.existsLedgerByExternalRef(null, coinNorm, externalRef);
      if (exists) return conflict(reply, 'external_ref already used');
    }
    let ledgerId;
    await withTransaction(async (client) => {
      await walletsDb.ensureCoin(client, coinNorm);
      await walletsDb.ensureWallet(client, agentId, coinNorm);
      await client.query(
        'UPDATE wallets SET balance_cents = balance_cents + $1 WHERE agent_id = $2 AND coin = $3',
        [amountCents, agentId, coinNorm]
      );
      const metadata = reason ? { reason, staff: true } : { staff: true };
      const q = `INSERT INTO ledger_entries (uuid, agent_id, coin, type, amount_cents, metadata, external_ref)
                 VALUES (gen_random_uuid(), $1, $2, 'credit', $3, $4, $5) RETURNING id`;
      const r = await client.query(q, [agentId, coinNorm, amountCents, JSON.stringify(metadata), externalRef || null]);
      ledgerId = r.rows[0].id;
    });
    return created(reply, {
      agent_id: agentId,
      coin: coinNorm,
      amount_cents: amountCents,
      ledger_id: ledgerId,
    });
  });

  fastify.post('/issuers', {
    schema: {
      tags: ['Staff'],
      description: 'Create an issuer (HMAC secret for signing credits).',
      body: {
        type: 'object',
        required: ['name', 'secret'],
        properties: {
          name: { type: 'string' },
          secret: { type: 'string' },
        },
      },
      response: { 201: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } },
    },
  }, async (request, reply) => {
    const { name, secret } = request.body || {};
    if (!name || !secret) return badRequest(reply, 'name and secret are required');
    const issuer = await issuersDb.createIssuer(name, secret, true);
    return created(reply, { id: issuer.id, name: issuer.name, status: issuer.status });
  });

  fastify.post('/issuers/:id/revoke', {
    schema: {
      tags: ['Staff'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } },
    },
  }, async (request, reply) => {
    const issuer = await issuersDb.revoke(request.params.id);
    if (!issuer) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Issuer not found' });
    return success(reply, issuer);
  });

  // 2FA setup: generate TOTP secret and persist (only if not already set in env)
  fastify.post('/2fa/setup', {
    schema: {
      tags: ['Staff'],
      description: 'Generate and persist TOTP secret for 2FA. Returns QR URL. Requires staff session.',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            qrUrl: { type: 'string' },
            secret: { type: 'string' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    if (config.staff2faSecret) {
      return reply.code(409).send({ ok: false, code: 'CONFLICT', message: '2FA secret is set via env (STAFF_2FA_SECRET)' });
    }
    const existing = await staffSettingsDb.get('totp_secret');
    if (existing) {
      return reply.code(409).send({ ok: false, code: 'CONFLICT', message: '2FA already configured' });
    }
    const secret = generateSecret();
    await staffSettingsDb.set('totp_secret', secret);
    const qrUrl = generateOtpauthUrl(secret);
    return reply.send({ ok: true, qrUrl, secret });
  });

  // --- Staff API (CRUD) ---
  fastify.get('/api/agents', {
    schema: { tags: ['Staff'], description: 'List agents (paginated)' },
  }, async (request, reply) => {
    const { limit, offset } = request.query || {};
    const result = await agentsDb.list({ limit, offset });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const total = Number(result?.total) || 0;
    const response = { ok: true, data: { rows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.post('/api/agents', {
    schema: {
      tags: ['Staff'],
      body: { type: 'object', properties: { name: { type: 'string' } } },
      response: { 201: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object', properties: { id: { type: 'string' }, secret: { type: 'string' } } } } } },
    },
  }, async (request, reply) => {
    const { name } = request.body || {};
    const agent = await agentsDb.create(name);
    return created(reply, { id: agent.id, secret: agent.secret });
  });

  fastify.get('/api/agents/:id', {
    schema: { tags: ['Staff'], params: { type: 'object', properties: { id: { type: 'string' } } }, response: { 200: { type: 'object' } } },
  }, async (request, reply) => {
    const agent = await agentsDb.getById(request.params.id);
    if (!agent) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Agent not found' });
    return reply.send({ ok: true, data: agent });
  });

  fastify.patch('/api/agents/:id', {
    schema: {
      tags: ['Staff'],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: { type: 'object', properties: { status: { type: 'string', enum: ['active', 'limited', 'banned'] } } },
      response: { 200: { type: 'object' } },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body || {};
    if (!status || !['active', 'limited', 'banned'].includes(status)) return badRequest(reply, 'status must be active, limited, or banned');
    const agent = await agentsDb.getById(id);
    if (!agent) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Agent not found' });
    await agentsDb.updateStatus(id, status);
    return reply.send({ ok: true, data: { ...agent, status } });
  });

  fastify.get('/api/humans', {
    schema: { 
      tags: ['Staff'], 
      description: 'List humans (paginated)'
    },
  }, async (request, reply) => {
    try {
      const { limit, offset, status } = request.query || {};
      request.log.info({ limit, offset, status }, 'GET /api/humans - calling humansDb.list');
      const result = await humansDb.list({ limit, offset, status });
      request.log.info({ result, type: typeof result }, 'GET /api/humans - result from humansDb.list');
      
      if (!result || typeof result !== 'object') {
        request.log.warn({ result }, 'humansDb.list returned unexpected result');
        const emptyResponse = { ok: true, data: { rows: [], total: 0 } };
        reply.header('Content-Type', 'application/json');
        return reply.send(emptyResponse);
      }
      
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const total = Number(result.total) || 0;
      
      const response = { 
        ok: true, 
        data: {
          rows: rows,
          total: total
        }
      };
      
      request.log.info({ 
        limit, 
        offset, 
        status, 
        rowsCount: rows.length, 
        total,
        responseString: JSON.stringify(response),
        responseType: typeof response,
        dataType: typeof response.data,
        rowsType: typeof response.data.rows
      }, 'GET /api/humans - sending response');
      
      // Enviar resposta diretamente via reply.raw (bypass completo do Fastify)
      const jsonString = JSON.stringify(response);
      request.log.info({ jsonString }, 'GET /api/humans - raw JSON string');
      
      reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
      reply.raw.end(jsonString);
      return;
    } catch (err) {
      request.log.error({ err, stack: err.stack }, 'Error in GET /api/humans');
      return reply.code(500).send({ ok: false, code: 'ERROR', message: err.message });
    }
  });

  fastify.get('/api/humans/:id', {
    schema: { tags: ['Staff'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object' } } },
  }, async (request, reply) => {
    const human = await humansDb.getHumanById(request.params.id);
    if (!human) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Human not found' });
    return reply.send({ ok: true, data: human });
  });

  fastify.patch('/api/humans/:id', {
    schema: {
      tags: ['Staff'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', properties: { status: { type: 'string', enum: ['pending', 'verified', 'banned'] } } },
      response: { 200: { type: 'object' } },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body || {};
    if (!status || !['pending', 'verified', 'banned'].includes(status)) return badRequest(reply, 'status must be pending, verified, or banned');
    const human = await humansDb.updateStatus(id, status);
    if (!human) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Human not found' });
    return reply.send({ ok: true, data: human });
  });

  fastify.get('/api/wallets', {
    schema: { tags: ['Staff'], description: 'List wallets (balances)' },
  }, async (request, reply) => {
    const { limit, offset, agent_id, coin } = request.query || {};
    const result = await walletsDb.listWallets({ limit, offset, agent_id, coin });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const total = Number(result?.total) || 0;
    const response = { ok: true, data: { rows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/ledger', {
    schema: { tags: ['Staff'], description: 'List ledger entries' },
  }, async (request, reply) => {
    const { limit, offset, agent_id, coin, type } = request.query || {};
    const result = await walletsDb.listLedger({ limit, offset, agent_id, coin, type });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const total = Number(result?.total) || 0;
    const response = { ok: true, data: { rows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/services', {
    schema: { tags: ['Staff'], description: 'List services' },
  }, async (request, reply) => {
    const { limit, offset, status, owner_agent_id, coin, q } = request.query || {};
    const result = await servicesDb.list({ limit, offset, status, owner_agent_id, coin, q });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const total = Number(result?.total) || 0;
    const response = { ok: true, data: { rows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/executions', {
    schema: { tags: ['Staff'], description: 'List executions' },
  }, async (request, reply) => {
    const { limit, offset, status, service_id, requester_agent_id } = request.query || {};
    const result = await executionsDb.listAll({ limit, offset, status, service_id, requester_agent_id });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const total = Number(result?.total) || 0;
    const response = { ok: true, data: { rows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/config', {
    schema: { tags: ['Staff'], description: 'Read-only config (safe flags)', response: { 200: { type: 'object' } } },
  }, async (_request, reply) => {
    return reply.send({
      ok: true,
      data: {
        defaultCoin: config.defaultCoin,
        enableFaucet: config.enableFaucet,
        staff2faEnabled: config.staff2faEnabled,
        staff2faForced: config.staff2faForced,
      },
    });
  });

  fastify.get('/api/issuers', {
    schema: { tags: ['Staff'], description: 'List issuers', response: { 200: { type: 'object' } } },
  }, async (_request, reply) => {
    const rows = await issuersDb.list();
    return reply.send({ ok: true, data: { rows } });
  });

  fastify.get('/api/coins', {
    schema: { tags: ['Staff'], description: 'List coins' },
  }, async (_request, reply) => {
    const rows = await walletsDb.listCoins();
    const response = { ok: true, data: { rows } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.post('/api/coins', {
    schema: { tags: ['Staff'], description: 'Create a new coin' },
  }, async (request, reply) => {
    const { coin, name, qtd_cents, prefix, suffix, decimals } = request.body || {};
    if (!coin || !coin.trim()) {
      return badRequest(reply, 'coin is required');
    }
    const existing = await walletsDb.getCoin(coin.toUpperCase());
    if (existing) {
      return conflict(reply, 'Coin already exists');
    }
    const created = await walletsDb.createCoin(coin, name, qtd_cents, prefix, suffix, decimals);
    return reply.code(201).send({ ok: true, data: created });
  });

  fastify.post('/api/coins/rebalance', {
    schema: { tags: ['Staff'], description: 'Recalculate circulating amount for all coins based on wallet balances' },
  }, async (_request, reply) => {
    const results = await walletsDb.rebalanceCoins();
    return reply.send({ ok: true, data: { updated: results } });
  });

  fastify.get('/api/coins/:coin', {
    schema: { tags: ['Staff'], description: 'Get a coin by symbol' },
  }, async (request, reply) => {
    const coinData = await walletsDb.getCoin(request.params.coin);
    if (!coinData) {
      return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Coin not found' });
    }
    return reply.send({ ok: true, data: coinData });
  });

  fastify.put('/api/coins/:coin', {
    schema: { tags: ['Staff'], description: 'Update a coin' },
  }, async (request, reply) => {
    const { name, qtd_cents, prefix, suffix, decimals } = request.body || {};
    const existing = await walletsDb.getCoin(request.params.coin);
    if (!existing) {
      return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Coin not found' });
    }
    const updated = await walletsDb.updateCoin(request.params.coin, { name, qtd_cents, prefix, suffix, decimals });
    return reply.send({ ok: true, data: updated });
  });

  fastify.delete('/api/coins/:coin', {
    schema: { tags: ['Staff'], description: 'Delete a coin' },
  }, async (request, reply) => {
    const existing = await walletsDb.getCoin(request.params.coin);
    if (!existing) {
      return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Coin not found' });
    }
    try {
      await walletsDb.deleteCoin(request.params.coin);
      return reply.send({ ok: true });
    } catch (err) {
      if (err.code === '23503') { // FK constraint
        return reply.code(409).send({ ok: false, code: 'CONFLICT', message: 'Cannot delete coin: it is being used by wallets or ledger entries' });
      }
      throw err;
    }
  });

  // SPA fallback: register last so /staff/api/* is always matched by API routes above
  const staffUiDist = opts?.staffUiDist;
  if (staffUiDist) {
    fastify.get('/', async (_req, reply) => reply.sendFile('index.html', staffUiDist));
    fastify.get('/*', async (req, reply) => {
      const p = req.params['*'] || '';
      if (p.startsWith('api/') || p.startsWith('assets/')) return reply.callNotFound();
      return reply.sendFile('index.html', staffUiDist);
    });
  }
}

module.exports = staffRoutes;
