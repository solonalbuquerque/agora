'use strict';

/**
 * B2.2 Structured JSON logger. All logs include timestamp, level, message, request_id,
 * and optional context (agent_id, human_id, service_id, issuer_id, instance_id, execution_id, event_type).
 * Never log secrets, tokens, or signatures.
 */

const SENSITIVE_KEYS = ['secret', 'token', 'signature', 'password', 'callback_token', 'authorization', 'x-signature', 'x-admin-token', 'x-callback-token'];

function sanitize(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const keyLower = String(k).toLowerCase();
    if (SENSITIVE_KEYS.some((s) => keyLower.includes(s))) continue;
    out[k] = typeof v === 'object' && v !== null ? sanitize(v) : v;
  }
  return out;
}

/**
 * Build standard log payload. Levels: info | warn | error.
 * Optional context: request_id, agent_id, human_id, service_id, issuer_id, instance_id, execution_id, event_type.
 */
function buildPayload(level, message, context = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message: String(message),
    request_id: context.request_id ?? null,
    agent_id: context.agent_id ?? null,
    human_id: context.human_id ?? null,
    service_id: context.service_id ?? null,
    issuer_id: context.issuer_id ?? null,
    instance_id: context.instance_id ?? null,
    execution_id: context.execution_id ?? null,
    event_type: context.event_type ?? null,
  };
  const extra = { ...context };
  delete extra.request_id;
  delete extra.agent_id;
  delete extra.human_id;
  delete extra.service_id;
  delete extra.issuer_id;
  delete extra.instance_id;
  delete extra.execution_id;
  delete extra.event_type;
  if (Object.keys(extra).length) {
    payload.details = sanitize(extra);
  }
  return payload;
}

function log(level, message, context = {}) {
  const payload = buildPayload(level, message, context);
  const line = JSON.stringify(payload);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

/**
 * Create a child logger bound to a request (for use in route handlers).
 * request may have: requestId, agentId, humanId, serviceId, issuerId, instanceId; and request.log (Fastify logger).
 */
function fromRequest(request) {
  const base = {
    request_id: request?.requestId ?? null,
    agent_id: request?.agentId ?? null,
    human_id: request?.humanId ?? null,
    service_id: request?.serviceId ?? null,
    issuer_id: request?.issuerId ?? null,
    instance_id: request?.instanceId ?? null,
    execution_id: request?.executionId ?? null,
  };
  return {
    info(message, extra = {}) {
      const payload = buildPayload('info', message, { ...base, ...extra });
      if (request?.log) request.log.info(payload);
      else log('info', message, { ...base, ...extra });
    },
    warn(message, extra = {}) {
      const payload = buildPayload('warn', message, { ...base, ...extra });
      if (request?.log) request.log.warn(payload);
      else log('warn', message, { ...base, ...extra });
    },
    error(message, extra = {}) {
      const payload = buildPayload('error', message, { ...base, ...extra });
      if (request?.log) request.log.error(payload);
      else log('error', message, { ...base, ...extra });
    },
  };
}

module.exports = {
  log,
  buildPayload,
  fromRequest,
  sanitize,
};
