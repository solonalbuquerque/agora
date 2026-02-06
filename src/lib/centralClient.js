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

module.exports = {
  registerCentralPreregister,
  registerCentral,
  activateCentral,
  centralRequest,
};
