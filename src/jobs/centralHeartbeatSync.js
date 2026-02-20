'use strict';

/**
 * centralHeartbeatSync
 *
 * Envia heartbeat estendido para a CENTRAL periodicamente, reportando:
 *   - connectivity_mode (pull | direct)
 *   - public_endpoints (se mode=direct)
 *   - capabilities (versão, etc.)
 *
 * Isso atualiza o resolver da CENTRAL para que callers saibam o modo certo.
 *
 * Env vars relevantes:
 *   AGORA_CONNECTIVITY_MODE=pull|direct
 *   AGORA_PUBLIC_URL – usado como endpoint quando mode=direct
 *   CENTRAL_HEARTBEAT_INTERVAL_MS=60000
 */

const config = require('../config');
const centralClient = require('../lib/centralClient');
const runtimeInstanceConfig = require('../lib/runtimeInstanceConfig');
const logger = require('../lib/logger');

const INTERVAL_MS = config.centralHeartbeatIntervalMs || 60000;

let timer = null;
let running = false;

async function sendHeartbeat() {
  const centralUrl = config.agoraCenterUrl;
  if (!centralUrl) return;

  let instanceId, instanceToken;
  try {
    const cfg = await runtimeInstanceConfig.getInstanceConfig();
    instanceId = cfg.instanceId;
    instanceToken = cfg.instanceToken;
  } catch (_) {
    return;
  }
  if (!instanceId || !instanceToken) return;

  const mode = config.agoraConnectivityMode || 'pull';
  const publicUrl = (config.agoraPublicUrl || '').trim();

  const publicEndpoints =
    mode === 'direct' && publicUrl
      ? [{ url: publicUrl, priority: 1 }]
      : [];

  try {
    await centralClient.heartbeatWithMeta(centralUrl, instanceId, instanceToken, {
      connectivity_mode: mode,
      public_endpoints: publicEndpoints,
      capabilities: { version: require('../../package.json').version || '1.0.0' },
    });
    logger.log('debug', `Heartbeat enviado para CENTRAL (mode=${mode})`);
  } catch (err) {
    logger.log('warn', 'Falha ao enviar heartbeat para CENTRAL', { err: err.message });
  }
}

function start() {
  if (running) return;
  const centralUrl = config.agoraCenterUrl;
  if (!centralUrl) {
    logger.log('debug', 'centralHeartbeatSync: AGORA_CENTER_URL não configurada, heartbeat desabilitado');
    return;
  }
  running = true;
  // Envia imediatamente e depois a cada INTERVAL_MS
  sendHeartbeat().catch(() => {});
  timer = setInterval(() => {
    sendHeartbeat().catch(() => {});
  }, INTERVAL_MS);
  logger.log('info', `centralHeartbeatSync iniciado (interval=${INTERVAL_MS}ms, mode=${config.agoraConnectivityMode || 'pull'})`);
}

function stop() {
  running = false;
  if (timer) clearInterval(timer);
}

module.exports = { start, stop };
