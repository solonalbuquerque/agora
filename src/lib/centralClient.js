'use strict';

/**
 * Cliente HTTP para a API do AGORA Center (Central).
 * Especificação: central-json.json
 *
 * - POST /instances/register  { name, base_url } -> { instance_id, registration_code, expires_at }
 * - POST /instances/activate  { instance_id, registration_code } -> { activation_token, status }
 */

const logger = require('./logger');

/**
 * Chama a Central e devolve o JSON ou lança com detalhes para debug.
 * @param {string} baseUrl - URL base da Central (ex: http://localhost:3001)
 * @param {string} path - path (ex: /instances/register)
 * @param {object} body - body JSON
 * @param {string} [requestId]
 * @param {{ authorization?: string }} [opts] - opcional: Authorization (ex: "Bearer <jwt>") para rotas que exigem humanAuth no Center
 * @returns {Promise<object>}
 */
async function centralRequest(baseUrl, path, body, requestId = null, opts = null) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const logCtx = { request_id: requestId, central_url: url, path };
  logger.log('info', `Central request: POST ${path}`, { ...logCtx, body_keys: body ? Object.keys(body) : [] });

  const headers = { 'Content-Type': 'application/json' };
  if (opts?.authorization) headers.Authorization = opts.authorization;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.log('error', 'Central request failed (network)', { ...logCtx, error: err.message, code: err.code });
    throw Object.assign(new Error(`Central unreachable: ${err.message}`), { code: 'CENTRAL_NETWORK', cause: err });
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    logger.log('error', 'Central response not JSON', { ...logCtx, status: res.status, body_preview: text.slice(0, 200) });
    throw Object.assign(new Error(`Central returned invalid JSON (${res.status})`), { code: 'CENTRAL_INVALID_RESPONSE', status: res.status });
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText || `HTTP ${res.status}`;
    logger.log('warn', `Central error: ${msg}`, { ...logCtx, status: res.status, data: logger.sanitize(data) });
    const err = new Error(msg);
    err.code = data?.code || 'CENTRAL_ERROR';
    err.status = res.status;
    err.details = data;
    throw err;
  }

  logger.log('info', `Central success: POST ${path}`, { ...logCtx, status: res.status });
  return data;
}

/**
 * Pré-registro na Central sem token: a instância envia name, base_url, owner_email; o Center associa ao humano (cria se não existir).
 * @param {string} baseUrl - AGORA_CENTER_URL
 * @param {string} name - Nome da instância
 * @param {string} instanceBaseUrl - base_url desta instância (ex: AGORA_PUBLIC_URL)
 * @param {string} ownerEmail - email do dono (associado no Center)
 * @param {string} [requestId]
 * @returns {Promise<{ instance_id: string, registration_code: string, expires_at: string }>}
 */
async function registerCentralPreregister(baseUrl, name, instanceBaseUrl, ownerEmail, requestId = null) {
  if (!baseUrl || !name || !instanceBaseUrl || !ownerEmail) {
    throw Object.assign(new Error('Central preregister requires baseUrl, name, instanceBaseUrl and ownerEmail'), { code: 'BAD_REQUEST' });
  }
  return centralRequest(
    baseUrl,
    '/instances/preregister',
    { name, base_url: instanceBaseUrl, owner_email: ownerEmail },
    requestId
  );
}

/**
 * Registro na Central com token de humano (fluxo legado). Preferir registerCentralPreregister quando não há token.
 * @param {string} baseUrl - AGORA_CENTER_URL
 * @param {string} name - Nome da instância
 * @param {string} instanceBaseUrl - base_url desta instância (ex: AGORA_PUBLIC_URL)
 * @param {string} [requestId]
 * @param {{ authorization?: string }} [opts] - Authorization do request (Bearer JWT do humano no Center)
 * @returns {Promise<{ instance_id: string, registration_code: string, expires_at: string }>}
 */
async function registerCentral(baseUrl, name, instanceBaseUrl, requestId = null, opts = null) {
  if (!baseUrl || !name || !instanceBaseUrl) {
    throw Object.assign(new Error('Central register requires baseUrl, name and instanceBaseUrl'), { code: 'BAD_REQUEST' });
  }
  return centralRequest(
    baseUrl,
    '/instances/register',
    { name, base_url: instanceBaseUrl },
    requestId,
    opts
  );
}

/**
 * Obtém o activation_token na Central. Sem token usa fluxo pré-registro; com token exige ser dono no Center.
 * @param {string} baseUrl - AGORA_CENTER_URL
 * @param {string} instanceId - instance_id devolvido pelo register
 * @param {string} registrationCode - registration_code devolvido pelo register
 * @param {string} [requestId]
 * @param {{ authorization?: string }} [opts] - opcional: Authorization (Bearer JWT do humano no Center)
 * @returns {Promise<{ activation_token: string, status: string }>}
 */
async function activateCentral(baseUrl, instanceId, registrationCode, requestId = null, opts = null) {
  if (!baseUrl || !instanceId || !registrationCode) {
    throw Object.assign(new Error('Central activate requires baseUrl, instance_id and registration_code'), { code: 'BAD_REQUEST' });
  }
  return centralRequest(
    baseUrl,
    '/instances/activate',
    { instance_id: instanceId, registration_code: registrationCode },
    requestId,
    opts
  );
}

/**
 * GET request to Central with instance auth (X-Instance-Id, X-Instance-Token).
 * @param {string} baseUrl - AGORA_CENTER_URL
 * @param {string} instanceId - instance id
 * @param {string} instanceToken - activation token
 * @param {string} path - path (e.g. /instances/:id/events)
 * @param {string} [requestId]
 * @returns {Promise<object>}
 */
async function centralGetWithInstanceAuth(baseUrl, instanceId, instanceToken, path, requestId = null) {
  if (!baseUrl || !instanceId || !instanceToken) {
    throw Object.assign(new Error('Central GET with instance auth requires baseUrl, instanceId and instanceToken'), { code: 'BAD_REQUEST' });
  }
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const logCtx = { request_id: requestId, central_url: url, path };
  logger.log('info', `Central GET ${path}`, logCtx);
  const headers = {
    'X-Instance-Id': instanceId,
    'X-Instance-Token': instanceToken,
  };
  let res;
  try {
    res = await fetch(url, { method: 'GET', headers });
  } catch (err) {
    logger.log('error', 'Central GET failed (network)', { ...logCtx, error: err.message, code: err.code });
    throw Object.assign(new Error(`Central unreachable: ${err.message}`), { code: 'CENTRAL_NETWORK', cause: err });
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    logger.log('error', 'Central GET response not JSON', { ...logCtx, status: res.status, body_preview: text.slice(0, 200) });
    throw Object.assign(new Error(`Central returned invalid JSON (${res.status})`), { code: 'CENTRAL_INVALID_RESPONSE', status: res.status });
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText || `HTTP ${res.status}`;
    logger.log('warn', `Central GET error: ${msg}`, { ...logCtx, status: res.status, data: logger.sanitize(data) });
    const err = new Error(msg);
    err.code = data?.code || 'CENTRAL_ERROR';
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

/**
 * POST request to Central with instance auth (no body).
 * @param {string} baseUrl - AGORA_CENTER_URL
 * @param {string} instanceId - instance id
 * @param {string} instanceToken - activation token
 * @param {string} path - path (e.g. /instances/:id/events/:event_id/ack)
 * @param {string} [requestId]
 * @returns {Promise<object>}
 */
async function centralPostWithInstanceAuth(baseUrl, instanceId, instanceToken, path, requestId = null) {
  if (!baseUrl || !instanceId || !instanceToken) {
    throw Object.assign(new Error('Central POST with instance auth requires baseUrl, instanceId and instanceToken'), { code: 'BAD_REQUEST' });
  }
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const logCtx = { request_id: requestId, central_url: url, path };
  logger.log('info', `Central POST ${path}`, logCtx);
  const headers = {
    'Content-Type': 'application/json',
    'X-Instance-Id': instanceId,
    'X-Instance-Token': instanceToken,
  };
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: '{}' });
  } catch (err) {
    logger.log('error', 'Central POST failed (network)', { ...logCtx, error: err.message, code: err.code });
    throw Object.assign(new Error(`Central unreachable: ${err.message}`), { code: 'CENTRAL_NETWORK', cause: err });
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    logger.log('error', 'Central POST response not JSON', { ...logCtx, status: res.status, body_preview: text.slice(0, 200) });
    throw Object.assign(new Error(`Central returned invalid JSON (${res.status})`), { code: 'CENTRAL_INVALID_RESPONSE', status: res.status });
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText || `HTTP ${res.status}`;
    logger.log('warn', `Central POST error: ${msg}`, { ...logCtx, status: res.status, data: logger.sanitize(data) });
    const err = new Error(msg);
    err.code = data?.code || 'CENTRAL_ERROR';
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

/**
 * Fetch events for this instance from Central (pull). Uses instance auth.
 * @param {string} baseUrl - AGORA_CENTER_URL
 * @param {string} instanceId - instance id
 * @param {string} instanceToken - activation token
 * @param {{ since_id?: string, limit?: number }} [opts]
 * @param {string} [requestId]
 * @returns {Promise<{ events: Array<{ id: string, type: string, payload: object, created_at: string }> }>}
 */
async function getCentralEvents(baseUrl, instanceId, instanceToken, opts = null, requestId = null) {
  const sinceId = opts?.since_id;
  const limit = Math.min(Number(opts?.limit) || 100, 100);
  const qs = new URLSearchParams();
  if (sinceId) qs.set('since_id', sinceId);
  qs.set('limit', String(limit));
  const path = `/instances/${encodeURIComponent(instanceId)}/events?${qs.toString()}`;
  return centralGetWithInstanceAuth(baseUrl, instanceId, instanceToken, path, requestId);
}

/**
 * Acknowledge an event to Central (so it can be considered processed).
 * @param {string} baseUrl - AGORA_CENTER_URL
 * @param {string} instanceId - instance id
 * @param {string} instanceToken - activation token
 * @param {string} eventId - event uuid
 * @param {string} [requestId]
 * @returns {Promise<{ acked: boolean }>}
 */
async function ackCentralEvent(baseUrl, instanceId, instanceToken, eventId, requestId = null) {
  const path = `/instances/${encodeURIComponent(instanceId)}/events/${encodeURIComponent(eventId)}/ack`;
  return centralPostWithInstanceAuth(baseUrl, instanceId, instanceToken, path, requestId);
}

/**
 * POST exported services list to Central (sync directory). Uses instance auth.
 * @param {string} baseUrl - AGORA_CENTER_URL
 * @param {string} instanceId - instance id
 * @param {string} instanceToken - activation token
 * @param {Array<{ service_ref: string, name?: string, description?: string, webhook_url?: string, metadata?: object, price_ago_cents?: number, price_alt_coin?: string, price_alt_cents?: number }>} services
 * @param {string} [requestId]
 * @returns {Promise<{ updated: number }>}
 */
async function postExportedServices(baseUrl, instanceId, instanceToken, services, requestId = null) {
  const path = `/instances/${encodeURIComponent(instanceId)}/services/exported`;
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const logCtx = { request_id: requestId, central_url: url, path };
  logger.log('info', `Central POST ${path}`, { ...logCtx, services_count: services?.length ?? 0 });
  const headers = {
    'Content-Type': 'application/json',
    'X-Instance-Id': instanceId,
    'X-Instance-Token': instanceToken,
  };
  const body = JSON.stringify({ services: services || [] });
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body });
  } catch (err) {
    logger.log('error', 'Central POST exported services failed (network)', { ...logCtx, error: err.message, code: err.code });
    throw Object.assign(new Error(`Central unreachable: ${err.message}`), { code: 'CENTRAL_NETWORK', cause: err });
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    logger.log('error', 'Central POST response not JSON', { ...logCtx, status: res.status, body_preview: text.slice(0, 200) });
    throw Object.assign(new Error(`Central returned invalid JSON (${res.status})`), { code: 'CENTRAL_INVALID_RESPONSE', status: res.status });
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText || `HTTP ${res.status}`;
    logger.log('warn', `Central POST error: ${msg}`, { ...logCtx, status: res.status, data: logger.sanitize(data) });
    const err = new Error(msg);
    err.code = data?.code || 'CENTRAL_ERROR';
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

module.exports = {
  registerCentralPreregister,
  registerCentral,
  activateCentral,
  centralRequest,
  getCentralEvents,
  ackCentralEvent,
  postExportedServices,
};
