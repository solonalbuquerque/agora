'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Structured security/audit log (JSON). Never log secrets, signatures, or tokens in clear.
 * Fields: event, request_id, agent_id?, service_id?, issuer_id?, instance_id?, message?, extra (sanitized).
 */
function securityLog(request, event, extra = {}) {
  const payload = {
    type: 'security',
    event,
    request_id: request?.requestId ?? request?.id ?? null,
    agent_id: request?.agentId ?? null,
    service_id: request?.serviceId ?? extra?.service_id ?? null,
    issuer_id: request?.issuerId ?? null,
    instance_id: request?.instanceId ?? null,
    ts: new Date().toISOString(),
  };
  if (extra && typeof extra === 'object') {
    const sanitized = { ...extra };
    delete sanitized.signature;
    delete sanitized.token;
    delete sanitized.secret;
    delete sanitized.callback_token;
    if (Object.keys(sanitized).length) payload.details = sanitized;
  }
  const log = request?.log;
  if (log) log.info(payload);
  else console.log(JSON.stringify(payload));
}

/**
 * Generate and attach request_id to the request (call from onRequest).
 */
function attachRequestId(request, reply, done) {
  request.requestId = request.headers['x-request-id'] || uuidv4();
  done();
}

module.exports = {
  securityLog,
  attachRequestId,
};
