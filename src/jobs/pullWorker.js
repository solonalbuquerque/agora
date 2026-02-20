'use strict';

/**
 * Pull Worker (modo PULL)
 *
 * Responsabilidade: quando a instância não tem endpoint público (NAT/CGNAT),
 * este worker consulta a CENTRAL por execute_jobs PENDING, reivindica cada um,
 * executa o serviço localmente e reporta o resultado.
 *
 * Env vars:
 *   INSTANCE_ENABLE_PULL_WORKER=true   – habilita o worker
 *   EXEC_PULL_CONCURRENCY=3            – máximo de jobs simultâneos
 *   EXEC_PULL_POLL_MS=5000             – intervalo entre polls
 *   AGORA_CONNECTIVITY_MODE=pull       – reportado no heartbeat para o resolver
 */

const config = require('../config');
const servicesDb = require('../db/services');
const centralClient = require('../lib/centralClient');
const runtimeInstanceConfig = require('../lib/runtimeInstanceConfig');
const compliance = require('../lib/compliance');
const logger = require('../lib/logger');
const { validateWebhookUrl } = require('../lib/security/webhookValidation');

const CONCURRENCY = config.execPullConcurrency || 3;
const POLL_MS = config.execPullPollMs || 5000;
const WEBHOOK_TIMEOUT_MS = config.serviceWebhookTimeoutMs || 30000;

let running = false;
let active = 0;
let loopTimer = null;

// Backoff simples para falhas de rede consecutivas
let networkFailures = 0;
const MAX_BACKOFF_MS = 60000;

/**
 * Executa um único job localmente.
 * 1) Reivindica o job na CENTRAL
 * 2) Encontra o serviço local pelo service_ref
 * 3) Chama o webhook do serviço
 * 4) Reporta sucesso ou falha para a CENTRAL
 */
async function executeJob(job, centralUrl, instanceId, instanceToken) {
  const { id, service_ref: serviceRef, payload, from_agent_ref: fromAgentRef, order_id: orderId } = job;

  // --- Claim ---
  let claimed;
  try {
    claimed = await centralClient.claimJob(centralUrl, instanceId, instanceToken, id);
  } catch (err) {
    logger.log('warn', `Pull worker: falha ao reivindicar job ${id}`, { err: err.message });
    return;
  }
  if (!claimed) {
    logger.log('debug', `Pull worker: job ${id} não reivindicado (expirado ou já reivindicado)`);
    return;
  }

  // --- Busca serviço local ---
  const service = await servicesDb.getByIdOrSlug(serviceRef).catch(() => null);
  if (!service || service.status !== 'active') {
    await centralClient.failJob(centralUrl, instanceId, instanceToken, id, {
      code: 'SERVICE_NOT_FOUND',
      message: `Serviço '${serviceRef}' não encontrado ou inativo nesta instância`,
    }).catch(() => {});
    logger.log('warn', `Pull worker: serviço '${serviceRef}' não encontrado (job ${id})`);
    return;
  }

  if (!service.webhook_url) {
    await centralClient.failJob(centralUrl, instanceId, instanceToken, id, {
      code: 'NO_WEBHOOK',
      message: 'Serviço sem webhook_url configurado',
    }).catch(() => {});
    return;
  }

  // --- Valida URL do webhook (SSRF protection) ---
  const validation = await validateWebhookUrl(service.webhook_url).catch(() => ({ ok: false, reason: 'validation error' }));
  if (!validation.ok) {
    await centralClient.failJob(centralUrl, instanceId, instanceToken, id, {
      code: 'WEBHOOK_BLOCKED',
      message: validation.reason || 'Webhook URL bloqueada',
    }).catch(() => {});
    return;
  }

  // --- Executa o webhook ---
  let result;
  let statusCode;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    const res = await fetch(service.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Central-Order-Id': String(orderId || ''),
        'X-From-Agent-Ref': String(fromAgentRef || ''),
        'X-Pull-Job-Id': String(id),
      },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    statusCode = res.status;
    const text = await res.text();
    try {
      result = text ? JSON.parse(text) : {};
    } catch (_) {
      result = { raw: text };
    }
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    logger.log('warn', `Pull worker: webhook falhou para job ${id}`, { err: err.message, isTimeout });
    await centralClient.failJob(centralUrl, instanceId, instanceToken, id, {
      code: isTimeout ? 'WEBHOOK_TIMEOUT' : 'WEBHOOK_ERROR',
      message: err.message,
    }).catch(() => {});
    return;
  }

  const success = statusCode >= 200 && statusCode < 300;
  if (success) {
    await centralClient.completeJob(centralUrl, instanceId, instanceToken, id, {
      result,
      status: 'success',
      status_code: statusCode,
    }).catch((err) => logger.log('error', `Pull worker: complete falhou job ${id}`, { err: err.message }));
    logger.log('info', `Pull worker: job ${id} concluído (${serviceRef}, status=${statusCode})`);
  } else {
    await centralClient.failJob(centralUrl, instanceId, instanceToken, id, {
      code: 'WEBHOOK_FAILED',
      message: `Webhook retornou status ${statusCode}`,
      status_code: statusCode,
      result,
    }).catch((err) => logger.log('error', `Pull worker: fail reportado job ${id}`, { err: err.message }));
    logger.log('warn', `Pull worker: job ${id} falhou (${serviceRef}, webhook status=${statusCode})`);
  }
}

async function poll() {
  if (!running) return;

  const centralUrl = config.agoraCenterUrl;
  if (!centralUrl) {
    logger.log('warn', 'Pull worker: AGORA_CENTER_URL não configurada');
    return;
  }

  // Verifica compliance antes de aceitar jobs
  try {
    const ok = await compliance.isInstanceCompliant();
    if (!ok) {
      logger.log('debug', 'Pull worker: instância não está em compliance, pulando poll');
      return;
    }
  } catch (_) { /* não bloqueia */ }

  let instanceId, instanceToken;
  try {
    const cfg = await runtimeInstanceConfig.getInstanceConfig();
    instanceId = cfg.instanceId;
    instanceToken = cfg.instanceToken;
  } catch (err) {
    logger.log('warn', 'Pull worker: config de instância indisponível', { err: err.message });
    return;
  }

  if (!instanceId || !instanceToken) {
    logger.log('warn', 'Pull worker: instanceId ou instanceToken não configurados');
    return;
  }

  const available = Math.max(0, CONCURRENCY - active);
  if (available === 0) return;

  let jobs;
  try {
    const res = await centralClient.getJobs(centralUrl, instanceId, instanceToken, {
      status: 'PENDING',
      limit: available,
    });
    jobs = res.jobs || [];
    networkFailures = 0; // reset backoff
  } catch (err) {
    networkFailures++;
    logger.log('warn', 'Pull worker: getJobs falhou', { err: err.message, failures: networkFailures });
    return;
  }

  if (jobs.length > 0) {
    logger.log('info', `Pull worker: ${jobs.length} job(s) encontrado(s)`, { active, concurrency: CONCURRENCY });
  }

  for (const job of jobs) {
    active++;
    executeJob(job, centralUrl, instanceId, instanceToken)
      .catch((err) => logger.log('error', `Pull worker: executeJob crash job ${job.id}`, { err: err.message }))
      .finally(() => { active--; });
  }
}

function backoffMs() {
  if (networkFailures <= 1) return POLL_MS;
  const exp = Math.min(POLL_MS * Math.pow(2, networkFailures - 1), MAX_BACKOFF_MS);
  return exp + Math.random() * 1000; // jitter
}

async function loop() {
  logger.log('info', `Pull worker iniciado (concurrency=${CONCURRENCY}, poll=${POLL_MS}ms)`);
  while (running) {
    try {
      await poll();
    } catch (err) {
      logger.log('error', 'Pull worker: erro no loop', { err: err.message });
    }
    const delay = backoffMs();
    await new Promise((r) => { loopTimer = setTimeout(r, delay); });
  }
  logger.log('info', 'Pull worker encerrado');
}

function start() {
  if (running) return;
  if (!config.instanceEnablePullWorker) {
    logger.log('info', 'Pull worker desabilitado (INSTANCE_ENABLE_PULL_WORKER != true)');
    return;
  }
  running = true;
  loop().catch((err) => {
    logger.log('error', 'Pull worker crash fatal', { err: err.message });
    running = false;
  });
}

function stop() {
  running = false;
  if (loopTimer) clearTimeout(loopTimer);
}

module.exports = { start, stop };
