'use strict';

const crypto = require('crypto');
const archiver = require('archiver');
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
const { formatMoney } = require('../lib/money');
const { getMaxTrustLevel, getAllLevels, loadFromDb } = require('../lib/trustLevels');
const trustLevelsDb = require('../db/trustLevels');
const statsDb = require('../db/stats');
const auditDb = require('../db/audit');
const { recordAuditEvent } = require('../lib/audit');
const { isReservedCoin } = require('../lib/compliance');

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

async function getCoinsMap() {
  const coins = await walletsDb.listCoins();
  const map = {};
  for (const c of coins) {
    map[c.coin] = c;
  }
  return map;
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
    if (isReservedCoin(coinNorm)) {
      return reply.code(403).send({ ok: false, code: 'RESERVED_COIN_MINT_FORBIDDEN', message: 'AGO cannot be minted locally. Use issuer credit when instance is compliant.' });
    }
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
      const requestId = request.requestId || null;
      const metadata = reason ? { reason, staff: true } : { staff: true };
      const q = `INSERT INTO ledger_entries (uuid, agent_id, coin, type, amount_cents, metadata, external_ref, request_id)
                 VALUES (gen_random_uuid(), $1, $2, 'credit', $3, $4, $5, $6) RETURNING id`;
      const r = await client.query(q, [agentId, coinNorm, amountCents, JSON.stringify(metadata), externalRef || null, requestId]);
      ledgerId = r.rows[0].id;
    });
    await recordAuditEvent({
      event_type: 'STAFF_MINT',
      actor_type: 'admin',
      target_type: 'wallet',
      target_id: agentId,
      metadata: { coin: coinNorm, amount_cents: amountCents, ledger_id: ledgerId },
      request_id: request.requestId,
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
      description: 'Create an issuer (HMAC secret for signing credits). Optionally set is_central for AGO Central issuer.',
      body: {
        type: 'object',
        required: ['name', 'secret'],
        properties: {
          name: { type: 'string' },
          secret: { type: 'string' },
          is_central: { type: 'boolean', default: false },
        },
      },
      response: { 201: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } },
    },
  }, async (request, reply) => {
    const { name, secret, is_central: isCentral } = request.body || {};
    if (!name || !secret) return badRequest(reply, 'name and secret are required');
    const issuer = await issuersDb.createIssuer(name, secret, true, !!isCentral);
    await recordAuditEvent({
      event_type: 'STAFF_ISSUER_CREATE',
      actor_type: 'admin',
      target_type: 'issuer',
      target_id: issuer.id,
      metadata: { name: issuer.name },
      request_id: request.requestId,
    });
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
    await recordAuditEvent({
      event_type: 'STAFF_ISSUER_REVOKE',
      actor_type: 'admin',
      target_type: 'issuer',
      target_id: issuer.id,
      request_id: request.requestId,
    });
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
  fastify.get('/api/trust-levels', {
    schema: { tags: ['Staff'], description: 'List trust level definitions (name, benefits, auto-promotion rules)' },
  }, async (_request, reply) => {
    const levels = getAllLevels();
    return reply.send({ ok: true, data: { rows: levels } });
  });

  fastify.patch('/api/trust-levels/:level', {
    schema: {
      tags: ['Staff'],
      params: { type: 'object', properties: { level: { type: 'integer', minimum: 0 } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          faucet_daily_limit_cents: { type: 'integer', minimum: 0 },
          max_transfer_per_tx_cents: { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
          allow_paid_services: { type: 'boolean' },
          auto_rule_min_calls: { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
          auto_rule_min_success_rate_pct: { oneOf: [{ type: 'number', minimum: 0, maximum: 100 }, { type: 'null' }] },
          auto_rule_min_account_days: { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
        },
      },
      response: { 200: { type: 'object' } },
    },
  }, async (request, reply) => {
    const level = Number(request.params.level);
    if (!Number.isInteger(level) || level < 0 || level > getMaxTrustLevel()) {
      return badRequest(reply, `level must be an integer between 0 and ${getMaxTrustLevel()}`);
    }
    const body = request.body || {};
    const existing = await trustLevelsDb.getByLevel(level);
    if (!existing) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Trust level not found' });
    const data = {};
    if (body.name !== undefined) data.name = String(body.name).trim() || existing.name;
    if (body.faucet_daily_limit_cents !== undefined) data.faucet_daily_limit_cents = Math.max(0, Number(body.faucet_daily_limit_cents));
    if (body.max_transfer_per_tx_cents !== undefined) {
      const v = body.max_transfer_per_tx_cents;
      data.max_transfer_per_tx_cents = (v === null || v === '' || (typeof v === 'number' && isNaN(v))) ? null : Math.max(0, Number(v));
    }
    if (body.allow_paid_services !== undefined) data.allow_paid_services = Boolean(body.allow_paid_services);
    if (body.auto_rule_min_calls !== undefined) data.auto_rule_min_calls = body.auto_rule_min_calls === null || body.auto_rule_min_calls === '' ? null : Math.max(0, Number(body.auto_rule_min_calls));
    if (body.auto_rule_min_success_rate_pct !== undefined) data.auto_rule_min_success_rate_pct = body.auto_rule_min_success_rate_pct === null || body.auto_rule_min_success_rate_pct === '' ? null : Math.min(100, Math.max(0, Number(body.auto_rule_min_success_rate_pct)));
    if (body.auto_rule_min_account_days !== undefined) data.auto_rule_min_account_days = body.auto_rule_min_account_days === null || body.auto_rule_min_account_days === '' ? null : Math.max(0, Number(body.auto_rule_min_account_days));
    const updated = await trustLevelsDb.update(level, data);
    await loadFromDb();
    return reply.send({ ok: true, data: updated });
  });

  fastify.get('/api/agents', {
    schema: { tags: ['Staff'], description: 'List agents (paginated)' },
  }, async (request, reply) => {
    const { limit, offset, status, q } = request.query || {};
    const result = await agentsDb.list({ limit, offset, status, q });
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
    const response = { ok: true, data: agent };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.patch('/api/agents/:id', {
    schema: {
      tags: ['Staff'],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'limited', 'banned'] },
          trust_level: { type: 'integer', minimum: 0 },
          can_register_services: { type: ['boolean', 'null'], description: 'null = inherit global, true = allowed, false = denied' },
        },
      },
      response: { 200: { type: 'object' } },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { status, trust_level: trustLevel, can_register_services: canRegisterServices } = request.body || {};
    const agent = await agentsDb.getById(id);
    if (!agent) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Agent not found' });
    const maxLevel = getMaxTrustLevel();
    if (trustLevel !== undefined) {
      const n = Number(trustLevel);
      if (!Number.isInteger(n) || n < 0 || n > maxLevel) {
        return badRequest(reply, `trust_level must be an integer between 0 and ${maxLevel}`);
      }
      await agentsDb.updateTrustLevel(id, n);
    }
    if (status !== undefined) {
      if (!status || !['active', 'limited', 'banned'].includes(status)) {
        return badRequest(reply, 'status must be active, limited, or banned');
      }
      await agentsDb.updateStatus(id, status);
      if (status === 'banned') {
        await recordAuditEvent({
          event_type: 'AGENT_BAN',
          actor_type: 'admin',
          target_type: 'agent',
          target_id: id,
          request_id: request.requestId,
        });
      }
    }
    if (canRegisterServices !== undefined) {
      const val = canRegisterServices === null ? null : !!canRegisterServices;
      await agentsDb.updateCanRegisterServices(id, val);
    }
    const updated = await agentsDb.getById(id);
    return reply.send({ ok: true, data: updated });
  });

  fastify.get('/api/humans', {
    schema: { 
      tags: ['Staff'], 
      description: 'List humans (paginated)'
    },
  }, async (request, reply) => {
    try {
      const { limit, offset, status, q } = request.query || {};
      request.log.info({ limit, offset, status, q }, 'GET /api/humans - calling humansDb.list');
      const result = await humansDb.list({ limit, offset, status, q });
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

  fastify.post('/api/humans', {
    schema: {
      tags: ['Staff'],
      description: 'Create a human (admin). Email required.',
      body: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string' } },
      },
      response: { 201: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } },
    },
  }, async (request, reply) => {
    const { email } = request.body || {};
    const emailNorm = (email || '').toString().toLowerCase().trim();
    if (!emailNorm) return badRequest(reply, 'email is required');
    const human = await humansDb.createHuman(emailNorm);
    await recordAuditEvent({
      event_type: 'STAFF_HUMAN_CREATE',
      actor_type: 'admin',
      target_type: 'human',
      target_id: human.id,
      metadata: { email: human.email },
      request_id: request.requestId,
    });
    return created(reply, human);
  });

  fastify.get('/api/humans/:id', {
    schema: { tags: ['Staff'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object' } } },
  }, async (request, reply) => {
    const human = await humansDb.getHumanById(request.params.id);
    if (!human) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Human not found' });
    const response = { ok: true, data: human };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
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
    if (status === 'banned') {
      await recordAuditEvent({
        event_type: 'HUMAN_BAN',
        actor_type: 'admin',
        target_type: 'human',
        target_id: id,
        request_id: request.requestId,
      });
    }
    return reply.send({ ok: true, data: human });
  });

  fastify.get('/api/humans/:id/agents', {
    schema: { tags: ['Staff'], description: 'List agents linked to a human' },
  }, async (request, reply) => {
    const agents = await humansDb.getAgentsByHumanId(request.params.id);
    return reply.send({ ok: true, data: { rows: agents } });
  });

  fastify.post('/api/humans/:id/agents', {
    schema: {
      tags: ['Staff'],
      description: 'Link an agent to a human.',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['agent_id'],
        properties: {
          agent_id: { type: 'string', format: 'uuid' },
          role: { type: 'string', enum: ['owner', 'viewer'], default: 'owner' },
        },
      },
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
    },
  }, async (request, reply) => {
    const humanId = request.params.id;
    const { agent_id: agentId, role = 'owner' } = request.body || {};
    if (!agentId) return badRequest(reply, 'agent_id is required');
    const human = await humansDb.getHumanById(humanId);
    if (!human) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Human not found' });
    const agent = await agentsDb.getById(agentId);
    if (!agent) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Agent not found' });
    const roleVal = role === 'viewer' ? 'viewer' : 'owner';
    await humansDb.linkAgent(humanId, agentId, roleVal);
    await recordAuditEvent({
      event_type: 'STAFF_HUMAN_AGENT_LINK',
      actor_type: 'admin',
      target_type: 'human',
      target_id: humanId,
      metadata: { agent_id: agentId, role: roleVal },
      request_id: request.requestId,
    });
    return reply.send({ ok: true });
  });

  fastify.delete('/api/humans/:id/agents/:agentId', {
    schema: {
      tags: ['Staff'],
      description: 'Unlink an agent from a human.',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          agentId: { type: 'string', format: 'uuid' },
        },
      },
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
    },
  }, async (request, reply) => {
    const { id: humanId, agentId } = request.params;
    const human = await humansDb.getHumanById(humanId);
    if (!human) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Human not found' });
    const { query } = require('../db/index');
    const res = await query('DELETE FROM human_agents WHERE human_id = $1 AND agent_id = $2 RETURNING 1', [humanId, agentId]);
    if (res.rows.length === 0) {
      return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Agent not linked to this human' });
    }
    await recordAuditEvent({
      event_type: 'STAFF_HUMAN_AGENT_UNLINK',
      actor_type: 'admin',
      target_type: 'human',
      target_id: humanId,
      metadata: { agent_id: agentId },
      request_id: request.requestId,
    });
    return reply.send({ ok: true });
  });

  fastify.get('/api/wallets', {
    schema: { tags: ['Staff'], description: 'List wallets (balances)' },
  }, async (request, reply) => {
    const { limit, offset, agent_id, coin, q } = request.query || {};
    const result = await walletsDb.listWallets({ limit, offset, agent_id, coin, q });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const coinsMap = await getCoinsMap();
    const formattedRows = rows.map((r) => ({
      ...r,
      balance_formated: formatMoney(r.balance_cents, r.coin, coinsMap),
    }));
    const total = Number(result?.total) || 0;
    const response = { ok: true, data: { rows: formattedRows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/ledger', {
    schema: { tags: ['Staff'], description: 'List ledger entries' },
  }, async (request, reply) => {
    const { limit, offset, agent_id, coin, type, q } = request.query || {};
    const result = await walletsDb.listLedger({ limit, offset, agent_id, coin, type, q });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const coinsMap = await getCoinsMap();
    const formattedRows = rows.map((r) => ({
      ...r,
      amount_formated: formatMoney(r.amount_cents, r.coin, coinsMap),
    }));
    const total = Number(result?.total) || 0;
    const response = { ok: true, data: { rows: formattedRows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/ledger/:id', {
    schema: { tags: ['Staff'], description: 'Get ledger entry by ID' },
  }, async (request, reply) => {
    const entry = await walletsDb.getLedgerById(request.params.id);
    if (!entry) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Ledger entry not found' });
    const coinCfg = await walletsDb.getCoin(entry.coin);
    const coinsMap = coinCfg ? { [coinCfg.coin]: coinCfg } : {};
    const response = { ok: true, data: { ...entry, amount_formated: formatMoney(entry.amount_cents, entry.coin, coinsMap) } };
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
    const coinsMap = await getCoinsMap();
    const formattedRows = rows.map((r) => ({
      ...r,
      price_formated: formatMoney(r.price_cents, r.coin, coinsMap),
    }));
    const total = Number(result?.total) || 0;
    const response = { ok: true, data: { rows: formattedRows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/services/:id', {
    schema: { tags: ['Staff'], description: 'Get service by ID' },
  }, async (request, reply) => {
    const service = await servicesDb.getById(request.params.id);
    if (!service) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Service not found' });
    const coinCfg = await walletsDb.getCoin(service.coin);
    const coinsMap = coinCfg ? { [coinCfg.coin]: coinCfg } : {};
    const response = { ok: true, data: { ...service, price_formated: formatMoney(service.price_cents, service.coin, coinsMap) } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.post('/api/services', {
    schema: {
      tags: ['Staff'],
      description: 'Create a service for a given agent (admin bypass).',
      body: {
        type: 'object',
        required: ['owner_agent_id', 'name', 'webhook_url'],
        properties: {
          owner_agent_id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string' },
          webhook_url: { type: 'string', format: 'uri' },
          input_schema: { type: 'object' },
          output_schema: { type: 'object' },
          price_cents: { type: 'integer', minimum: 0 },
          coin: { type: 'string', maxLength: 16 },
          export: { type: 'boolean', default: false },
          slug: { type: ['string', 'null'] },
        },
      },
      response: { 201: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } },
    },
  }, async (request, reply) => {
    const body = request.body || {};
    const { owner_agent_id: ownerAgentId, name, webhook_url: webhookUrl } = body;
    if (!ownerAgentId || !name || !webhookUrl) {
      return badRequest(reply, 'owner_agent_id, name and webhook_url are required');
    }
    const agent = await agentsDb.getById(ownerAgentId);
    if (!agent) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Agent not found' });
    if (body.slug !== undefined && body.slug !== null && !servicesDb.isValidSlug(body.slug)) {
      return badRequest(reply, 'Invalid slug: use only lowercase letters, numbers and hyphens; max 64 characters.');
    }
    if (!config.allowInsecureWebhook) {
      const { validateWebhookUrl } = require('../lib/security/webhookValidation');
      const validation = await validateWebhookUrl(webhookUrl);
      if (!validation.ok) {
        return badRequest(reply, validation.reason || 'Invalid webhook URL');
      }
    }
    const priceCents = body.price_cents ?? 0;
    const wantExport = body.export === true;
    const compliance = require('../lib/compliance');
    if (wantExport) {
      const compliant = await compliance.isInstanceCompliant();
      if (!compliant) {
        return reply.code(403).send({ ok: false, code: 'INSTANCE_NOT_COMPLIANT', message: 'Instance must be compliant to export services' });
      }
    }
    const service = await servicesDb.create({
      owner_agent_id: ownerAgentId,
      name: body.name,
      description: body.description,
      webhook_url: webhookUrl,
      input_schema: body.input_schema,
      output_schema: body.output_schema,
      price_cents: priceCents,
      coin: body.coin || config.defaultCoin || 'AGOTEST',
      export: wantExport,
      slug: body.slug,
    });
    await recordAuditEvent({
      event_type: 'STAFF_SERVICE_CREATE',
      actor_type: 'admin',
      target_type: 'service',
      target_id: service.id,
      metadata: { owner_agent_id: ownerAgentId, name: service.name },
      request_id: request.requestId,
    });
    const coinCfg = await walletsDb.getCoin(service.coin);
    const coinsMap = coinCfg ? { [coinCfg.coin]: coinCfg } : {};
    return created(reply, { ...service, price_formated: formatMoney(service.price_cents, service.coin, coinsMap) });
  });

  fastify.post('/api/services/:id/pause', {
    schema: { tags: ['Staff'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object' } } },
  }, async (request, reply) => {
    const service = await servicesDb.getById(request.params.id);
    if (!service) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Service not found' });
    await servicesDb.update(service.id, { status: 'paused' });
    const updated = await servicesDb.getById(service.id);
    await recordAuditEvent({
      event_type: 'STAFF_SERVICE_PAUSE',
      actor_type: 'admin',
      target_type: 'service',
      target_id: service.id,
      request_id: request.requestId,
    });
    return reply.send({ ok: true, data: updated });
  });

  fastify.post('/api/services/:id/resume', {
    schema: { tags: ['Staff'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object' } } },
  }, async (request, reply) => {
    const service = await servicesDb.getById(request.params.id);
    if (!service) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Service not found' });
    await servicesDb.update(service.id, { status: 'active' });
    const updated = await servicesDb.getById(service.id);
    await recordAuditEvent({
      event_type: 'STAFF_SERVICE_RESUME',
      actor_type: 'admin',
      target_type: 'service',
      target_id: service.id,
      request_id: request.requestId,
    });
    return reply.send({ ok: true, data: updated });
  });

  fastify.get('/api/executions', {
    schema: { tags: ['Staff'], description: 'List executions' },
  }, async (request, reply) => {
    const { limit, offset, status, service_id, requester_agent_id, q } = request.query || {};
    const result = await executionsDb.listAll({ limit, offset, status, service_id, requester_agent_id, q });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const total = Number(result?.total) || 0;
    const response = { ok: true, data: { rows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/executions/:id', {
    schema: { tags: ['Staff'], description: 'Get execution by ID' },
  }, async (request, reply) => {
    const execution = await executionsDb.getById(request.params.id);
    if (!execution) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Execution not found' });
    const response = { ok: true, data: execution };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  /**
   * GET /staff/api/executions/callbacks
   * Callback Security: lista execuções com status de token, data de recebimento e motivo de rejeição.
   * Filtros: status, token_status (Valid|Used|Expired), from_date, to_date, q (uuid search), limit, offset.
   */
  fastify.get('/api/executions/callbacks', {
    schema: { tags: ['Staff'], description: 'Callback security: list executions with callback token status and rejection reason.' },
  }, async (request, reply) => {
    const { status, token_status, from_date, to_date, q, limit: rawLimit, offset: rawOffset } = request.query || {};
    const limit = Math.min(Math.max(Number(rawLimit) || 50, 1), 200);
    const offset = Math.max(Number(rawOffset) || 0, 0);

    const params = [];
    const where = ['1=1'];
    let idx = 1;

    if (status) {
      where.push(`e.status = $${idx++}`);
      params.push(status);
    }

    // token_status é derivado — convertemos para condição SQL
    if (token_status === 'Used') {
      where.push(`e.callback_received_at IS NOT NULL`);
    } else if (token_status === 'Expired') {
      where.push(`e.callback_received_at IS NULL AND e.callback_token_expires_at IS NOT NULL AND e.callback_token_expires_at < NOW()`);
    } else if (token_status === 'Valid') {
      where.push(`e.callback_received_at IS NULL AND (e.callback_token_expires_at IS NULL OR e.callback_token_expires_at >= NOW())`);
    }

    if (from_date) {
      where.push(`e.created_at >= $${idx++}`);
      params.push(from_date);
    }
    if (to_date) {
      where.push(`e.created_at <= $${idx++}`);
      params.push(to_date);
    }
    if (q) {
      where.push(`e.uuid::text ILIKE $${idx++}`);
      params.push(`%${q}%`);
    }

    const whereClause = where.join(' AND ');

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM executions e WHERE ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;

    params.push(limit, offset);
    const res = await query(
      `SELECT
         e.uuid          AS execution_id,
         e.service_id,
         s.name          AS service_name,
         e.status,
         e.latency_ms,
         e.created_at,
         e.callback_received_at,
         e.callback_token_expires_at,
         CASE
           WHEN e.callback_received_at IS NOT NULL                                                          THEN 'Used'
           WHEN e.callback_token_expires_at IS NOT NULL AND e.callback_token_expires_at < NOW()             THEN 'Expired'
           ELSE 'Valid'
         END AS callback_token_status,
         CASE
           WHEN e.status = 'failed' AND e.callback_received_at IS NULL
                AND e.callback_token_expires_at IS NOT NULL AND e.callback_token_expires_at < NOW()          THEN 'token_expired'
           WHEN e.status = 'failed' AND e.callback_received_at IS NOT NULL                                  THEN 'execution_failed'
           WHEN e.status = 'failed'                                                                         THEN 'no_callback_received'
           ELSE NULL
         END AS rejected_reason
       FROM executions e
       LEFT JOIN services s ON s.id = e.service_id
       WHERE ${whereClause}
       ORDER BY e.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    const response = { ok: true, data: { rows: res.rows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  const pkg = require('../../package.json');

  fastify.get('/api/config', {
    schema: { tags: ['Staff'], description: 'Read-only config (safe flags)', response: { 200: { type: 'object' } } },
  }, async (_request, reply) => {
    const compliance = require('../lib/compliance');
    const compliant = await compliance.isInstanceCompliant();
    const exportEnabled = (await staffSettingsDb.get('export_services_enabled')) === 'true';
    const publicBotRegEnabled = (await staffSettingsDb.get('public_bot_registration_enabled')) === 'true';
    const publicBotRegKeyHash = await staffSettingsDb.get('public_bot_registration_key_hash');
    const botsCanRegisterServices = (await staffSettingsDb.get('bots_can_register_services')) !== 'false';
    const baseUrl = (config.agoraPublicUrl || '').replace(/\/$/, '') || `http://localhost:${config.port || 3000}`;
    const response = {
      ok: true,
      data: {
        defaultCoin: config.defaultCoin,
        enableFaucet: config.enableFaucet,
        staff2faEnabled: config.staff2faEnabled,
        staff2faForced: config.staff2faForced,
        reservedCoin: compliance.RESERVED_COIN,
        export_services_enabled: exportEnabled,
        public_bot_registration_enabled: publicBotRegEnabled,
        public_bot_registration_key_defined: !!(publicBotRegKeyHash && publicBotRegKeyHash.length > 0),
        bots_can_register_services: botsCanRegisterServices,
        ago_inbound_derived: compliant ? 'enabled' : 'disabled',
        ago_outbound_derived: compliant ? 'enabled' : 'disabled',
        export_derived: compliant && exportEnabled ? 'enabled' : 'disabled',
        base_url: baseUrl,
        agora_center_url: config.agoraCenterUrl || null,
        version: pkg.version || '1.0.0',
        build: process.env.BUILD_ID || process.env.BUILD_TIMESTAMP || null,
      },
    };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.patch('/api/settings', {
    schema: {
      tags: ['Staff'],
      description: 'Update staff settings (export_services_enabled, public_bot_registration_enabled, bots_can_register_services, registration_key_remove)',
      body: {
        type: 'object',
        properties: {
          export_services_enabled: { type: 'boolean' },
          public_bot_registration_enabled: { type: 'boolean' },
          bots_can_register_services: { type: 'boolean' },
          registration_key_remove: { type: 'boolean', description: 'Set true to clear the public bot registration key' },
        },
      },
      response: { 200: { type: 'object' } },
    },
  }, async (request, reply) => {
    const body = request.body || {};
    if (typeof body.export_services_enabled === 'boolean') {
      await staffSettingsDb.set('export_services_enabled', body.export_services_enabled ? 'true' : 'false');
    }
    if (typeof body.public_bot_registration_enabled === 'boolean') {
      await staffSettingsDb.set('public_bot_registration_enabled', body.public_bot_registration_enabled ? 'true' : 'false');
    }
    if (typeof body.bots_can_register_services === 'boolean') {
      await staffSettingsDb.set('bots_can_register_services', body.bots_can_register_services ? 'true' : 'false');
    }
    if (body.registration_key_remove === true) {
      await staffSettingsDb.set('public_bot_registration_key_hash', '');
    }
    const exportEnabled = (await staffSettingsDb.get('export_services_enabled')) === 'true';
    const publicBotRegEnabled = (await staffSettingsDb.get('public_bot_registration_enabled')) === 'true';
    const publicBotRegKeyHash = await staffSettingsDb.get('public_bot_registration_key_hash');
    const botsCanRegister = (await staffSettingsDb.get('bots_can_register_services')) !== 'false';
    return reply.send({
      ok: true,
      data: {
        export_services_enabled: exportEnabled,
        public_bot_registration_enabled: publicBotRegEnabled,
        public_bot_registration_key_defined: !!(publicBotRegKeyHash && publicBotRegKeyHash.length > 0),
        bots_can_register_services: botsCanRegister,
      },
    });
  });

  fastify.post('/api/settings/registration-key/generate', {
    schema: {
      tags: ['Staff'],
      description: 'Generate a new public bot registration key. Returns the key in plain text once; store it securely. Previous key is replaced.',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                registration_key: { type: 'string', description: 'Use this in body registration_key or header X-Registration-Key when calling POST /agents/register. Shown only once.' },
              },
            },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const key = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
    await staffSettingsDb.set('public_bot_registration_key_hash', hash);
    return reply.send({ ok: true, data: { registration_key: key } });
  });

  const instanceDb = require('../db/instance');
  const bridgeDb = require('../db/bridgeTransfers');

  fastify.post('/api/central/sync-directory', {
    schema: {
      tags: ['Staff'],
      description: 'Force sync exported services to Central directory. Returns count of services found and sent.',
      response: { 200: { type: 'object' } },
    },
  }, async (request, reply) => {
    const runtimeInstanceConfig = require('../lib/runtimeInstanceConfig');
    const { instanceId, instanceToken } = await runtimeInstanceConfig.getInstanceConfig();
    if (!config.agoraCenterUrl || !instanceId || !instanceToken) {
      return reply.code(400).send({
        ok: false,
        code: 'CENTRAL_SYNC_NOT_CONFIGURED',
        message: 'AGORA_CENTER_URL, INSTANCE_ID and INSTANCE_TOKEN are required (set in .env or register the instance).',
        debug: {
          has_center_url: !!config.agoraCenterUrl,
          has_instance_id: !!instanceId,
          has_instance_token: !!instanceToken,
        },
      });
    }
    // Count exported services before syncing for diagnostic response
    const exportedResult = await servicesDb.list({
      status: 'active',
      visibility: 'exported',
      export_status: 'active',
      limit: 200,
      offset: 0,
    });
    const exportedCount = (exportedResult?.rows || []).length;
    const centralDirectorySync = require('../jobs/centralDirectorySync');
    try {
      await centralDirectorySync.syncOnce();
      return reply.send({
        ok: true,
        message: exportedCount === 0
          ? 'Sync ran but no active exported services found to send.'
          : `Directory sync completed. ${exportedCount} service(s) sent to Central.`,
        exported_services_count: exportedCount,
      });
    } catch (err) {
      request.log?.warn({ err }, 'Central directory sync failed');
      return reply.code(502).send({
        ok: false,
        code: 'SYNC_FAILED',
        message: err?.message || 'Central directory sync failed',
      });
    }
  });

  fastify.post('/api/central/sync-ago', {
    schema: {
      tags: ['Staff'],
      description: 'Force sync AGO events from Central (INSTANCE_CREDIT, CREDIT_INSTANCE). Requires AGORA_CENTER_URL, INSTANCE_ID and INSTANCE_TOKEN.',
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' }, message: { type: 'string' } } } },
    },
  }, async (request, reply) => {
    const runtimeInstanceConfig = require('../lib/runtimeInstanceConfig');
    const { instanceId, instanceToken } = await runtimeInstanceConfig.getInstanceConfig();
    if (!config.agoraCenterUrl || !instanceId || !instanceToken) {
      return reply.code(400).send({
        ok: false,
        code: 'CENTRAL_SYNC_NOT_CONFIGURED',
        message: 'AGORA_CENTER_URL, INSTANCE_ID and INSTANCE_TOKEN are required (set in .env or register the instance).',
      });
    }
    const centralEventsConsumer = require('../jobs/centralEventsConsumer');
    try {
      await centralEventsConsumer.pollOnce();
      return reply.send({ ok: true, message: 'AGO sync completed.' });
    } catch (err) {
      request.log?.warn({ err }, 'Central AGO sync failed');
      return reply.code(502).send({
        ok: false,
        code: 'SYNC_FAILED',
        message: err?.message || 'Central sync failed',
      });
    }
  });

  fastify.get('/api/instance', {
    schema: { tags: ['Staff'], description: 'Get current instance (compliance, status, AGO balance, Central policy)' },
  }, async (_request, reply) => {
    const compliance = require('../lib/compliance');
    const inst = await compliance.getCurrentInstance();
    const exportEnabled = (await staffSettingsDb.get('export_services_enabled')) === 'true';
    const reservedCoin = config.reservedCoin || 'AGO';
    let total_ago_cents = 0;
    try {
      const sumRes = await query(
        'SELECT COALESCE(SUM(balance_cents), 0)::bigint AS total FROM wallets WHERE coin = $1',
        [reservedCoin]
      );
      total_ago_cents = sumRes.rows[0] ? Number(sumRes.rows[0].total) : 0;
    } catch (_) {}
    let central_policy = null;
    if (inst?.id) {
      const instanceCentralPolicyDb = require('../db/instanceCentralPolicy');
      central_policy = await instanceCentralPolicyDb.get(inst.id);
    }
    const runtimeInstanceConfig = require('../lib/runtimeInstanceConfig');
    const { instanceId: runtimeInstanceId, instanceToken: runtimeInstanceToken } = await runtimeInstanceConfig.getInstanceConfig();
    const central_sync_available = !!(config.agoraCenterUrl && runtimeInstanceId && runtimeInstanceToken);
    const configured_instance_id = runtimeInstanceId || inst?.id || null;
    // Warn when .env INSTANCE_ID differs from staff_settings (panel took priority)
    const dbInstanceId = await staffSettingsDb.get('instance_id');
    const env_instance_id = config.instanceId || null;
    const env_conflict = !!(env_instance_id && dbInstanceId && env_instance_id !== dbInstanceId);
    // Always fetch name/slug and treasury from Center when configured
    let center_instance_info = null;
    let center_treasury = null;
    if (config.agoraCenterUrl && configured_instance_id && runtimeInstanceToken) {
      const centralClient = require('../lib/centralClient');
      const [ciResult, treasuryResult] = await Promise.allSettled([
        centralClient.getInstanceByIdOrSlug(config.agoraCenterUrl, configured_instance_id, null),
        centralClient.getCentralTreasury(config.agoraCenterUrl, configured_instance_id, runtimeInstanceToken),
      ]);
      if (ciResult.status === 'fulfilled' && ciResult.value) {
        const ci = ciResult.value;
        center_instance_info = { name: ci.name, slug: ci.slug, status: ci.status, base_url: ci.base_url };
      }
      if (treasuryResult.status === 'fulfilled' && treasuryResult.value) {
        center_treasury = treasuryResult.value;
      }
    } else if (config.agoraCenterUrl && configured_instance_id) {
      try {
        const centralClient = require('../lib/centralClient');
        const ci = await centralClient.getInstanceByIdOrSlug(config.agoraCenterUrl, configured_instance_id, null);
        if (ci) center_instance_info = { name: ci.name, slug: ci.slug, status: ci.status, base_url: ci.base_url };
      } catch (_) {}
    }
    const response = {
      ok: true,
      data: {
        ...(inst ? {
          ...inst,
          compliant: inst.status === 'registered',
          export_services_enabled: exportEnabled,
        } : {}),
        total_ago_cents,
        central_policy,
        central_sync_available,
        configured_instance_id,
        center_instance_info,
        center_treasury,
        env_instance_id,
        env_conflict,
        treasury_agent_id: await staffSettingsDb.get('instance_treasury_agent_id'),
      },
    };
    return reply.send(response);
  });

  fastify.patch('/api/instance/config', {
    schema: {
      tags: ['Staff'],
      description: 'Set instance_id and optionally instance_token (stored in DB, used at runtime). Overrides .env when set.',
      body: {
        type: 'object',
        required: ['instance_id'],
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'Instance UUID from Center' },
          instance_token: { type: 'string', description: 'Activation token from Center (optional, leave empty to keep current)' },
        },
      },
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' }, message: { type: 'string' } } } },
    },
  }, async (request, reply) => {
    if (!config.agoraCenterUrl) {
      return reply.code(400).send({
        ok: false,
        code: 'CENTRAL_NOT_CONFIGURED',
        message: 'AGORA_CENTER_URL is required to configure the instance.',
      });
    }
    const { instance_id: instanceId, instance_token: instanceToken } = request.body || {};
    if (!instanceId || typeof instanceId !== 'string' || !instanceId.trim()) {
      return reply.code(400).send({
        ok: false,
        code: 'BAD_REQUEST',
        message: 'instance_id is required.',
      });
    }
    const id = instanceId.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return reply.code(400).send({
        ok: false,
        code: 'BAD_REQUEST',
        message: 'instance_id must be a valid UUID.',
      });
    }
    await staffSettingsDb.set('instance_id', id);
    if (instanceToken != null && typeof instanceToken === 'string' && instanceToken.trim()) {
      await staffSettingsDb.set('instance_token', instanceToken.trim());
    }
    await recordAuditEvent({
      event_type: 'INSTANCE_CONFIG_UPDATED',
      actor_type: 'admin',
      target_type: 'instance',
      target_id: id,
      metadata: { via: 'staff_panel' },
      request_id: request.requestId,
    });
    return reply.send({ ok: true, data: { instance_id: id }, message: 'Configuration saved. Sync with Center will use these values.' });
  });

  fastify.post('/api/instance/ensure-treasury-agent', {
    schema: { tags: ['Staff'], description: 'Ensure instance treasury agent exists (creates if not). Used for existing installations before this feature was added.' },
  }, async (request, reply) => {
    const compliance = require('../lib/compliance');
    const agentsDb = require('../db/agents');
    const inst = await compliance.getCurrentInstance();
    const existing = await staffSettingsDb.get('instance_treasury_agent_id');
    if (existing) {
      const agentRow = await agentsDb.getById(existing);
      return reply.send({ ok: true, data: { treasury_agent_id: existing, created: false, name: agentRow?.name } });
    }
    const agentName = inst?.name ? `${inst.name} Treasury` : 'Instance Treasury';
    const agent = await agentsDb.create(agentName);
    await staffSettingsDb.set('instance_treasury_agent_id', agent.id);
    return reply.send({ ok: true, data: { treasury_agent_id: agent.id, created: true, name: agentName } });
  });

  fastify.post('/api/instance/sync-policy', {
    schema: { tags: ['Staff'], description: 'Trigger Central policy sync now (GET /instances/me/policy)' },
  }, async (request, reply) => {
    const runtimeInstanceConfig = require('../lib/runtimeInstanceConfig');
    const { instanceId, instanceToken } = await runtimeInstanceConfig.getInstanceConfig();
    if (!config.agoraCenterUrl || !instanceId || !instanceToken) {
      return reply.code(400).send({
        ok: false,
        code: 'CENTRAL_NOT_CONFIGURED',
        message: 'AGORA_CENTER_URL, INSTANCE_ID and INSTANCE_TOKEN are required (set in .env or register the instance).',
      });
    }
    const centralPolicySync = require('../jobs/centralPolicySync');
    await centralPolicySync.syncOnce();
    return reply.send({ ok: true, message: 'Policy sync triggered' });
  });

  fastify.patch('/api/instance/:id/status', {
    schema: {
      tags: ['Staff'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['unregistered', 'pending', 'registered', 'flagged', 'blocked'] } } },
      response: { 200: { type: 'object' } },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body || {};
    const inst = await instanceDb.getById(id);
    if (!inst) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Instance not found' });
    const updated = await instanceDb.updateStatus(id, status);
    if (status && status !== 'registered') {
      const n = await servicesDb.suspendAllExported('INSTANCE_NOT_COMPLIANT');
      if (n > 0) request.log.info({ suspended_count: n }, 'Suspended exported services');
    }
    await recordAuditEvent({
      event_type: 'INSTANCE_STATUS_CHANGED',
      actor_type: 'admin',
      target_type: 'instance',
      target_id: id,
      metadata: { status },
      request_id: request.requestId,
    });
    return reply.send({ ok: true, data: updated });
  });

  fastify.get('/api/bridge', {
    schema: { tags: ['Staff'], description: 'List bridge transfers' },
  }, async (request, reply) => {
    const { status, kind, coin, from_date, to_date, limit, offset } = request.query || {};
    const result = await bridgeDb.list({ status, kind, coin, from_date, to_date, limit, offset });
    return reply.send({ ok: true, data: { rows: result.rows, total: result.total } });
  });

  fastify.get('/api/bridge/:id', {
    schema: { tags: ['Staff'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (request, reply) => {
    const transfer = await bridgeDb.getById(request.params.id);
    if (!transfer) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Bridge transfer not found' });
    return reply.send({ ok: true, data: transfer });
  });

  fastify.post('/api/bridge/:id/settle', {
    schema: { tags: ['Staff'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object' } } },
  }, async (request, reply) => {
    const { id } = request.params;
    const transfer = await bridgeDb.getById(id);
    if (!transfer) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Bridge transfer not found' });
    if (transfer.status !== 'pending') {
      return reply.code(409).send({ ok: false, code: 'CONFLICT', message: 'Transfer is not pending' });
    }
    await withTransaction(async (client) => {
      await walletsDb.insertLedgerEntry(client, transfer.from_agent_id, transfer.coin, 'debit_outbound', transfer.amount_cents, { bridge_transfer_id: id }, null, request.requestId);
    });
    const updated = await bridgeDb.updateStatus(id, 'settled');
    await recordAuditEvent({
      event_type: 'BRIDGE_TRANSFER_SETTLED',
      actor_type: 'admin',
      target_type: 'wallet',
      target_id: transfer.from_agent_id,
      metadata: { bridge_transfer_id: id, coin: transfer.coin, amount_cents: transfer.amount_cents },
      request_id: request.requestId,
    });
    return reply.send({ ok: true, data: updated });
  });

  fastify.post('/api/bridge/:id/reject', {
    schema: {
      tags: ['Staff'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', properties: { reason: { type: 'string' } } },
      response: { 200: { type: 'object' } },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const reason = (request.body || {}).reason || null;
    const transfer = await bridgeDb.getById(id);
    if (!transfer) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Bridge transfer not found' });
    if (transfer.status !== 'pending') {
      return reply.code(409).send({ ok: false, code: 'CONFLICT', message: 'Transfer is not pending' });
    }
    await withTransaction(async (client) => {
      await walletsDb.credit(client, transfer.from_agent_id, transfer.coin, transfer.amount_cents, { bridge_refund: id }, request.requestId);
    });
    const updated = await bridgeDb.updateStatus(id, 'rejected', reason);
    await recordAuditEvent({
      event_type: 'BRIDGE_TRANSFER_REJECTED',
      actor_type: 'admin',
      target_type: 'wallet',
      target_id: transfer.from_agent_id,
      metadata: { bridge_transfer_id: id, reason },
      request_id: request.requestId,
    });
    return reply.send({ ok: true, data: updated });
  });

  fastify.get('/api/services/exported', {
    schema: { tags: ['Staff'], description: 'List exported services (visibility=exported)' },
  }, async (request, reply) => {
    const { export_status, owner_agent_id, limit, offset } = request.query || {};
    const result = await servicesDb.list({
      visibility: 'exported',
      export_status: export_status || undefined,
      owner_agent_id: owner_agent_id || undefined,
      limit: limit || 50,
      offset: offset || 0,
    });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const coinsMap = await getCoinsMap();
    const formattedRows = rows.map((r) => ({ ...r, price_formated: formatMoney(r.price_cents, r.coin, coinsMap) }));
    return reply.send({ ok: true, data: { rows: formattedRows, total: result?.total ?? 0 } });
  });

  fastify.post('/api/services/:id/resume-export', {
    schema: { tags: ['Staff'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object' } } },
  }, async (request, reply) => {
    const compliance = require('../lib/compliance');
    const serviceId = request.params.id;
    const service = await servicesDb.getById(serviceId);
    if (!service) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Service not found' });
    if (service.visibility !== 'exported') {
      return reply.code(400).send({ ok: false, code: 'BAD_REQUEST', message: 'Service is not exported' });
    }
    const compliant = await compliance.isInstanceCompliant();
    if (!compliant) {
      return reply.code(403).send({ ok: false, code: 'INSTANCE_NOT_COMPLIANT', message: 'Instance must be compliant' });
    }
    const exportEnabled = await staffSettingsDb.get('export_services_enabled');
    if (exportEnabled !== 'true') {
      return reply.code(403).send({ ok: false, code: 'EXPORTS_DISABLED', message: 'Export is disabled in settings' });
    }
    const updated = await servicesDb.resumeExport(serviceId);
    await recordAuditEvent({
      event_type: 'SERVICE_EXPORT_RESUMED',
      actor_type: 'admin',
      target_type: 'service',
      target_id: serviceId,
      request_id: request.requestId,
    });
    return reply.send({ ok: true, data: updated });
  });

  fastify.get('/api/statistics', {
    schema: { tags: ['Staff'], description: 'System statistics: totals, last 24h, % vs yesterday, DB sizes', response: { 200: { type: 'object' } } },
  }, async (_request, reply) => {
    const data = await statsDb.getStatistics();
    const response = { ok: true, data };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/dashboard', {
    schema: { tags: ['Staff'], description: 'Operational dashboard: instance summary, Central metrics, bridge pending, executions last 24h, error rate, paused services, recent ledger, recent audit' },
  }, async (_request, reply) => {
    const compliance = require('../lib/compliance');
    const instanceCentralPolicyDb = require('../db/instanceCentralPolicy');
    const reservedCoin = config.reservedCoin || 'AGO';
    const [executions24hRes, errorRateRes, pausedRes, recentLedgerRes, recentAuditRes, inst, exportEnabled, bridgePending] = await Promise.all([
      query(`SELECT status, COUNT(*)::int AS cnt FROM executions WHERE created_at >= NOW() - INTERVAL '24 hours' GROUP BY status`, []),
      query(`SELECT COUNT(*) FILTER (WHERE status = 'failed')::int AS failed, COUNT(*)::int AS total FROM executions WHERE created_at >= NOW() - INTERVAL '24 hours'`, []),
      query(`SELECT COUNT(*)::int AS n FROM services WHERE status = 'paused'`, []),
      walletsDb.listLedger({ limit: 10, offset: 0 }),
      auditDb.list({ limit: 15, offset: 0 }),
      compliance.getCurrentInstance(),
      staffSettingsDb.get('export_services_enabled'),
      bridgeDb.getPendingSummary(),
    ]);
    const [agoSumRes, centralPolicyResolved] = await Promise.all([
      query('SELECT COALESCE(SUM(balance_cents), 0)::bigint AS total FROM wallets WHERE coin = $1', [reservedCoin]),
      (inst?.id ? instanceCentralPolicyDb.get(inst.id).catch(() => null) : Promise.resolve(null)),
    ]);
    const byStatus = {};
    (executions24hRes.rows || []).forEach((r) => { byStatus[r.status] = r.cnt; });
    const failed = errorRateRes.rows[0]?.failed ?? 0;
    const total = errorRateRes.rows[0]?.total ?? 0;
    const error_rate_pct = total > 0 ? Number((100 * failed / total).toFixed(1)) : 0;
    const paused_services = Number(pausedRes.rows[0]?.n ?? 0);
    const recent_ledger = (recentLedgerRes.rows || []).map((r) => ({
      id: r.id,
      agent_id: r.agent_id,
      coin: r.coin,
      type: r.type,
      amount_cents: r.amount_cents,
      created_at: r.created_at,
    }));
    const recent_audit = (recentAuditRes.rows || []).map((r) => ({
      id: r.id,
      event_type: r.event_type,
      actor_type: r.actor_type,
      actor_id: r.actor_id,
      target_type: r.target_type,
      target_id: r.target_id,
      created_at: r.created_at,
    }));
    const base_url = (config.agoraPublicUrl || '').replace(/\/$/, '') || `http://localhost:${config.port || 3000}`;
    const agora_center_url = config.agoraCenterUrl || null;
    const runtimeInstanceConfig = require('../lib/runtimeInstanceConfig');
    const { instanceId: dashInstanceId, instanceToken: dashInstanceToken } = await runtimeInstanceConfig.getInstanceConfig();
    let instance_summary = inst ? {
      instance_id: inst.id,
      name: inst.name,
      slug: inst.slug,
      status: inst.status,
      compliant: inst.status === 'registered',
      export_services_enabled: exportEnabled === 'true',
      last_seen_at: inst.last_seen_at,
      registered_at: inst.registered_at,
    } : null;
    if (!instance_summary && dashInstanceId && agora_center_url) {
      try {
        const centralClient = require('../lib/centralClient');
        const centerInstance = await centralClient.getInstanceByIdOrSlug(agora_center_url, dashInstanceId, null);
        if (centerInstance) {
          instance_summary = {
            instance_id: centerInstance.id,
            name: centerInstance.name,
            slug: centerInstance.slug,
            status: centerInstance.status,
            compliant: centerInstance.status === 'registered',
            export_services_enabled: exportEnabled === 'true',
            last_seen_at: centerInstance.last_seen_at,
            registered_at: null,
          };
        }
      } catch (_) {}
    }
    const central_sync_available = !!(agora_center_url && dashInstanceId && dashInstanceToken);
    const central_ago_cents = (agoSumRes?.rows?.[0] != null) ? Number(agoSumRes.rows[0].total) : 0;
    const central_policy_summary = (centralPolicyResolved && typeof centralPolicyResolved === 'object') ? {
      trust_level: centralPolicyResolved.trust_level || 'unverified',
      visibility_status: centralPolicyResolved.visibility_status || 'unlisted',
      updated_at: centralPolicyResolved.updated_at,
    } : null;
    const response = {
      ok: true,
      data: {
        instance_summary,
        base_url,
        agora_center_url,
        central_sync_available,
        central_ago_cents,
        central_policy_summary,
        bridge_pending_summary: { count: bridgePending.count, total_cents: bridgePending.total_cents },
        executions_last_24h: byStatus,
        executions_total_24h: total,
        error_rate_pct: error_rate_pct,
        paused_services_count: paused_services,
        recent_ledger: recent_ledger,
        recent_audit: recent_audit,
      },
    };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/audit', {
    schema: { tags: ['Staff'], description: 'List audit events (same filters as admin/audit)' },
  }, async (request, reply) => {
    const { actor_type, actor_id, event_type, from_date, to_date, limit, offset } = request.query || {};
    const result = await auditDb.list({ actor_type, actor_id, event_type, from_date, to_date, limit, offset });
    const response = { ok: true, data: { rows: result.rows, total: result.total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  fastify.get('/api/backup', {
    schema: { tags: ['Staff'], description: 'Full database dump as ZIP (one JSON file per table)' },
  }, async (request, reply) => {
    function quoteIdent(name) {
      return '"' + String(name).replace(/"/g, '""') + '"';
    }
    let tables;
    try {
      const res = await query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`, []);
      tables = (res.rows || []).map((r) => r.tablename);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ ok: false, code: 'BACKUP_ERROR', message: 'Failed to list tables' });
    }
    const date = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '-').replace(/-(\d{2})-(\d{2})$/, '-$1$2');
    const filename = `agora-backup-${date}.zip`;
    reply.raw.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      request.log.error(err);
      try { reply.raw.destroy(); } catch (_) {}
    });
    archive.pipe(reply.raw);
    for (const table of tables) {
      try {
        const q = await query(`SELECT * FROM ${quoteIdent(table)}`, []);
        const rows = q.rows || [];
        archive.append(JSON.stringify(rows, null, 2), { name: `${table}.json` });
      } catch (err) {
        request.log.error(err);
        archive.append(JSON.stringify({ error: err.message }), { name: `${table}.json.err` });
      }
    }
    await archive.finalize();
    return;
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
    const coinsMap = {};
    for (const c of rows) coinsMap[c.coin] = c;
    const formattedRows = rows.map((r) => ({
      ...r,
      circulating_formated: formatMoney(r.circulating_cents, r.coin, coinsMap),
    }));
    const response = { ok: true, data: { rows: formattedRows } };
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
    const coinsMap = { [coinData.coin]: coinData };
    const response = {
      ok: true,
      data: {
        ...coinData,
        circulating_formated: formatMoney(coinData.circulating_cents, coinData.coin, coinsMap),
      },
    };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
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

  // ─────────────────────────────────────────────────────────────────────────
  // SECURITY & OBSERVABILITY endpoints (B1 / B2)
  // ─────────────────────────────────────────────────────────────────────────

  /** GET /staff/api/security/overview — resumo de segurança com dados reais */
  fastify.get('/api/security/overview', {
    schema: { tags: ['Staff'], description: 'Security overview: real aggregates from audit + executions.' },
  }, async (_request, reply) => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [authFailRes, webhookBlockRes, cbRes, replayRes, cbRejectRes] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS n FROM audit_events
         WHERE created_at >= $1 AND event_type ILIKE ANY(ARRAY['%AUTH_FAIL%','%INVALID_HMAC%','%UNAUTHORIZED%'])`,
        [since24h]
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM audit_events
         WHERE created_at >= $1 AND event_type ILIKE ANY(ARRAY['%WEBHOOK_BLOCKED%','%SSRF%'])`,
        [since24h]
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM audit_events
         WHERE created_at >= $1 AND event_type IN ('SERVICE_PAUSED','circuit_breaker_triggered')`,
        [since24h]
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM executions
         WHERE created_at >= $1 AND idempotency_key IS NOT NULL AND status IN ('success','failed')`,
        [since24h]
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM executions
         WHERE created_at >= $1 AND status = 'failed'
           AND callback_received_at IS NULL
           AND callback_token_expires_at IS NOT NULL AND callback_token_expires_at < NOW()`,
        [since24h]
      ),
    ]);
    const data = {
      failed_auth_24h:             { count: authFailRes.rows[0]?.n ?? 0,    link: '/staff/audit?event_type=AUTH_FAILURE' },
      rate_limit_violations_24h:   { count: 0,                              link: '/staff/rate-limits?status=throttled', note: 'In-memory/Redis only' },
      blocked_webhooks_24h:        { count: webhookBlockRes.rows[0]?.n ?? 0, link: '/staff/webhook-security' },
      circuit_breakers_triggered:  { count: cbRes.rows[0]?.n ?? 0,          link: '/staff/circuit-breakers' },
      idempotency_replays_prevented: { count: replayRes.rows[0]?.n ?? 0,    link: '/staff/executions' },
      callback_rejections:         { count: cbRejectRes.rows[0]?.n ?? 0,    link: '/staff/callbacks?token_status=Expired' },
    };
    return reply.send({ ok: true, data });
  });

  /** GET /staff/api/security/rate-limits — estado do rate-limit (Redis/memory; sem persistência) */
  fastify.get('/api/security/rate-limits', {
    schema: { tags: ['Staff'], description: 'Rate limit state (Redis/in-memory; not persisted to DB).' },
  }, async (_request, reply) => {
    return reply.send({ ok: true, data: { rows: [], total: 0, note: 'Rate limit state is in-memory/Redis and not persisted.' } });
  });
  fastify.post('/api/security/rate-limits/reset', {
    schema: { tags: ['Staff'] },
  }, async (_request, reply) => reply.send({ ok: true }));
  fastify.post('/api/security/rate-limits/block', {
    schema: { tags: ['Staff'] },
  }, async (_request, reply) => reply.send({ ok: true }));

  /** GET /staff/api/services/webhook-security — serviços com status do webhook e falhas consecutivas */
  fastify.get('/api/services/webhook-security', {
    schema: { tags: ['Staff'], description: 'Services with webhook health (circuit breaker status).' },
  }, async (request, reply) => {
    const { status, owner_agent_id, limit: rawLimit, offset: rawOffset } = request.query || {};
    const limit = Math.min(Math.max(Number(rawLimit) || 50, 1), 200);
    const offset = Math.max(Number(rawOffset) || 0, 0);
    const where = ['1=1'];
    const params = [];
    let idx = 1;
    if (status) { where.push(`s.status = $${idx++}`); params.push(status); }
    if (owner_agent_id) { where.push(`s.owner_agent_id = $${idx++}`); params.push(owner_agent_id); }
    const whereClause = where.join(' AND ');
    const countRes = await query(`SELECT COUNT(*)::int AS total FROM services s WHERE ${whereClause}`, params);
    const total = countRes.rows[0]?.total ?? 0;
    params.push(limit, offset);
    const res = await query(
      `SELECT s.id AS service_id, s.name AS service_name, s.owner_agent_id, s.webhook_url,
              s.status,
              CASE WHEN s.status = 'paused' THEN 'Open' ELSE 'Closed' END AS circuit_breaker_state,
              s.updated_at AS last_attempt
       FROM services s
       WHERE ${whereClause}
       ORDER BY s.updated_at DESC NULLS LAST
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );
    const response = { ok: true, data: { rows: res.rows, total } };
    reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify(response));
    return;
  });

  /** GET /staff/api/services/circuit-breakers — serviços com estado do circuit breaker */
  fastify.get('/api/services/circuit-breakers', {
    schema: { tags: ['Staff'], description: 'Services with circuit breaker state (paused = Open).' },
  }, async (_request, reply) => {
    const res = await query(
      `SELECT s.id AS service_id, s.name AS service_name,
              CASE WHEN s.status = 'paused' THEN 'Open' ELSE 'Closed' END AS breaker_state,
              s.status,
              s.updated_at AS last_updated
       FROM services s
       ORDER BY CASE WHEN s.status = 'paused' THEN 0 ELSE 1 END, s.updated_at DESC NULLS LAST
       LIMIT 200`,
      []
    );
    return reply.send({ ok: true, data: { rows: res.rows, total: res.rows.length } });
  });

  /** POST /staff/api/services/:id/circuit-breaker/close — força fechamento (resume serviço) */
  fastify.post('/api/services/:id/circuit-breaker/close', {
    schema: { tags: ['Staff'], params: { type: 'object', properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const svc = await servicesDb.getById(request.params.id);
    if (!svc) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Service not found' });
    if (svc.status !== 'paused') return reply.send({ ok: true, data: svc });
    await servicesDb.update(svc.id, { status: 'active' });
    await recordAuditEvent({
      event_type: 'CIRCUIT_BREAKER_CLOSED',
      actor_type: 'admin',
      target_type: 'service',
      target_id: svc.id,
      request_id: request.requestId,
    });
    const updated = await servicesDb.getById(svc.id);
    return reply.send({ ok: true, data: updated });
  });

  /** GET /staff/api/requests — log de requests (sem tabela persistida; retorna vazio) */
  fastify.get('/api/requests', {
    schema: { tags: ['Staff'], description: 'Request log (not persisted to DB; returns empty).' },
  }, async (_request, reply) => {
    return reply.send({ ok: true, data: { rows: [], total: 0, note: 'Request log is not persisted to DB.' } });
  });
  fastify.get('/api/requests/:id', {
    schema: { tags: ['Staff'] },
  }, async (_request, reply) => reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Request not found' }));

  /** GET /staff/api/metrics — métricas operacionais com dados reais do banco */
  fastify.get('/api/metrics', {
    schema: { tags: ['Staff'], description: 'Operational metrics derived from DB.' },
  }, async (_request, reply) => {
    const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [execStats, latencyStats, cbRate] = await Promise.all([
      query(
        `SELECT status, COUNT(*)::int AS cnt FROM executions WHERE created_at >= $1 GROUP BY status`,
        [since1h]
      ),
      query(
        `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
         FROM executions WHERE latency_ms IS NOT NULL AND created_at >= $1`,
        [since1h]
      ),
      query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE callback_received_at IS NOT NULL)::int AS received
         FROM executions WHERE created_at >= $1 AND status IN ('success','failed')`,
        [since1h]
      ),
    ]);
    const byStatus = {};
    (execStats.rows || []).forEach((r) => { byStatus[r.status] = r.cnt; });
    const success = byStatus.success || 0;
    const failed = byStatus.failed || 0;
    const cbTotal = cbRate.rows[0]?.total ?? 0;
    const cbReceived = cbRate.rows[0]?.received ?? 0;
    const data = {
      execution_success_vs_failure: { success, failed },
      webhook_latency: {
        p50_ms: Math.round(Number(latencyStats.rows[0]?.p50) || 0),
        p95_ms: Math.round(Number(latencyStats.rows[0]?.p95) || 0),
      },
      callback_success_rate: cbTotal > 0 ? Number((cbReceived / cbTotal).toFixed(4)) : null,
      executions_by_status_1h: byStatus,
    };
    return reply.send({ ok: true, data });
  });

  /** GET /staff/api/health — health check detalhado */
  fastify.get('/api/health', {
    schema: { tags: ['Staff'], description: 'Detailed health check.' },
  }, async (_request, reply) => {
    let dbStatus = 'Unknown';
    let dbLatencyMs = null;
    try {
      const t0 = Date.now();
      await query('SELECT 1', []);
      dbLatencyMs = Date.now() - t0;
      dbStatus = 'Connected';
    } catch (_) {
      dbStatus = 'Error';
    }
    const { getRedis } = require('../lib/redis');
    let redisStatus = 'Disabled';
    try {
      const redis = await getRedis();
      if (redis) {
        await redis.ping();
        redisStatus = 'Connected';
      }
    } catch (_) {
      redisStatus = 'Error';
    }
    const data = {
      api_process: 'Healthy',
      database: dbStatus,
      database_latency_ms: dbLatencyMs,
      redis: redisStatus,
      uptime_seconds: Math.floor(process.uptime()),
      last_readiness_check: new Date().toISOString(),
    };
    return reply.send({ ok: true, data });
  });

  /** GET /staff/api/data-retention — configuração de retenção */
  fastify.get('/api/data-retention', {
    schema: { tags: ['Staff'], description: 'Data retention configuration.' },
  }, async (_request, reply) => {
    const data = {
      execution_retention_days: config.executionRetentionDays || 0,
      audit_log_retention_days: config.auditRetentionDays || 0,
      note: 'Set EXECUTION_RETENTION_DAYS and AUDIT_RETENTION_DAYS in .env to enable automatic cleanup.',
    };
    return reply.send({ ok: true, data });
  });

  fastify.patch('/api/data-retention', {
    schema: { tags: ['Staff'], body: { type: 'object' } },
  }, async (_request, reply) => reply.send({ ok: true, data: {}, message: 'Retention settings are configured via environment variables.' }));

  /** GET /staff/api/data-retention/preview — quantos registros seriam removidos */
  fastify.get('/api/data-retention/preview', {
    schema: { tags: ['Staff'], description: 'Preview: count rows that would be deleted based on retention settings.' },
  }, async (_request, reply) => {
    const execDays = config.executionRetentionDays || 0;
    const auditDays = config.auditRetentionDays || 0;
    let execToDelete = 0;
    let auditToDelete = 0;
    if (execDays > 0) {
      const r = await query(
        `SELECT COUNT(*)::int AS n FROM executions WHERE created_at < NOW() - ($1 || ' days')::interval`,
        [execDays]
      ).catch(() => ({ rows: [{ n: 0 }] }));
      execToDelete = r.rows[0]?.n ?? 0;
    }
    if (auditDays > 0) {
      const r = await query(
        `SELECT COUNT(*)::int AS n FROM audit_events WHERE created_at < NOW() - ($1 || ' days')::interval`,
        [auditDays]
      ).catch(() => ({ rows: [{ n: 0 }] }));
      auditToDelete = r.rows[0]?.n ?? 0;
    }
    return reply.send({ ok: true, data: { executions_to_delete: execToDelete, audit_events_to_delete: auditToDelete } });
  });

  /** POST /staff/api/data-retention/run — executa limpeza de retenção */
  fastify.post('/api/data-retention/run', {
    schema: { tags: ['Staff'], description: 'Run data retention cleanup.' },
  }, async (request, reply) => {
    const execDays = config.executionRetentionDays || 0;
    const auditDays = config.auditRetentionDays || 0;
    if (execDays === 0 && auditDays === 0) {
      return reply.send({ ok: true, data: { executions_deleted: 0, audit_events_deleted: 0 }, message: 'Retention days are 0 — nothing deleted.' });
    }
    let execDeleted = 0;
    let auditDeleted = 0;
    if (execDays > 0) {
      const r = await query(
        `DELETE FROM executions WHERE created_at < NOW() - ($1 || ' days')::interval RETURNING id`,
        [execDays]
      ).catch(() => ({ rows: [] }));
      execDeleted = r.rows.length;
    }
    if (auditDays > 0) {
      const r = await query(
        `DELETE FROM audit_events WHERE created_at < NOW() - ($1 || ' days')::interval RETURNING id`,
        [auditDays]
      ).catch(() => ({ rows: [] }));
      auditDeleted = r.rows.length;
    }
    await recordAuditEvent({
      event_type: 'DATA_RETENTION_RUN',
      actor_type: 'admin',
      target_type: 'system',
      metadata: { executions_deleted: execDeleted, audit_events_deleted: auditDeleted },
      request_id: request.requestId,
    });
    return reply.send({ ok: true, data: { executions_deleted: execDeleted, audit_events_deleted: auditDeleted } });
  });

  // ─────────────────────────────────────────────────────────────────────────

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
