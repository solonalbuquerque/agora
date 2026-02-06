'use strict';

const config = require('../config');

const enabled = () => config.enableMetrics === true;

// In-memory counters: key -> number
const counters = new Map();
// Histogram buckets (duration ms): key -> array of observed values (we export as buckets)
const durationBuckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function counterKey(name, labels) {
  const parts = Object.entries(labels || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}="${String(v)}"`);
  return `${name}{${parts.join(',')}}`;
}

function inc(name, labels = {}, value = 1) {
  if (!enabled()) return;
  const key = counterKey(name, labels);
  counters.set(key, (counters.get(key) || 0) + value);
}

function observeDuration(name, labels, ms) {
  if (!enabled()) return;
  const key = counterKey(name, labels);
  if (!counters.has(key + ':hist')) {
    counters.set(key + ':hist', []);
  }
  const arr = counters.get(key + ':hist');
  arr.push(ms);
  if (arr.length > 10000) arr.shift();
}

function setGauge(name, labels, value) {
  if (!enabled()) return;
  const key = counterKey(name, labels);
  counters.set(key + ':gauge', value);
}

/** Normalize path for low cardinality: replace UUIDs and numeric ids with _ */
function normalizePath(path) {
  if (!path || typeof path !== 'string') return path;
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/_')
    .replace(/\/\d+/g, '/_');
}

function httpRequest(method, path, status, durationMs) {
  const normalized = normalizePath(path);
  inc('agora_http_requests_total', { method, path: normalized, status: String(status) });
  for (const le of durationBuckets) {
    if (durationMs <= le) inc('agora_http_request_duration_ms_bucket', { method, path: normalized, le: String(le) });
  }
  inc('agora_http_request_duration_ms_bucket', { method, path: normalized, le: '+Inf' });
}

function executionRecorded(status, serviceId) {
  inc('agora_execute_total', { status, service_id: serviceId || '_' });
}

function webhookLatency(serviceId, latencyMs) {
  for (const le of durationBuckets) {
    if (latencyMs <= le) inc('agora_webhook_latency_ms_bucket', { service_id: serviceId || '_', le: String(le) });
  }
  inc('agora_webhook_latency_ms_bucket', { service_id: serviceId || '_', le: '+Inf' });
}

function walletTransfer(coin) {
  inc('agora_wallet_transfers_total', { coin: coin || '_' });
}

function callbackReceived(status) {
  inc('agora_callbacks_total', { status });
}

/** Call from /metrics handler to set current ledger balances (gauges). */
function setLedgerBalances(byCoin) {
  if (!enabled()) return;
  for (const [coin, totalCents] of Object.entries(byCoin || {})) {
    setGauge('agora_ledger_balance', { coin }, totalCents);
  }
}

/** Export Prometheus text format. */
function exportPrometheus(ledgerBalances = {}) {
  const lines = [];
  const byPrefix = {};
  for (const [key, value] of counters.entries()) {
    if (key.endsWith(':hist') || key.endsWith(':gauge')) continue;
    const prefix = key.replace(/\{.*/, '');
    if (!byPrefix[prefix]) byPrefix[prefix] = [];
    byPrefix[prefix].push(`${key} ${value}`);
  }
  lines.push('# HELP agora_http_requests_total Total HTTP requests', '# TYPE agora_http_requests_total counter');
  (byPrefix['agora_http_requests_total'] || []).forEach((l) => lines.push(l));
  lines.push('', '# HELP agora_http_request_duration_ms_bucket Request duration buckets', '# TYPE agora_http_request_duration_ms_bucket counter');
  (byPrefix['agora_http_request_duration_ms_bucket'] || []).forEach((l) => lines.push(l));
  lines.push('', '# HELP agora_execute_total Total executions', '# TYPE agora_execute_total counter');
  (byPrefix['agora_execute_total'] || []).forEach((l) => lines.push(l));
  lines.push('', '# HELP agora_webhook_latency_ms_bucket Webhook latency buckets', '# TYPE agora_webhook_latency_ms_bucket counter');
  (byPrefix['agora_webhook_latency_ms_bucket'] || []).forEach((l) => lines.push(l));
  lines.push('', '# HELP agora_wallet_transfers_total Wallet transfers', '# TYPE agora_wallet_transfers_total counter');
  (byPrefix['agora_wallet_transfers_total'] || []).forEach((l) => lines.push(l));
  lines.push('', '# HELP agora_callbacks_total Callbacks received', '# TYPE agora_callbacks_total counter');
  (byPrefix['agora_callbacks_total'] || []).forEach((l) => lines.push(l));
  lines.push('', '# HELP agora_ledger_balance Total balance per coin (cents)', '# TYPE agora_ledger_balance gauge');
  for (const [coin, totalCents] of Object.entries(ledgerBalances)) {
    lines.push(`agora_ledger_balance{coin="${coin}"} ${totalCents}`);
  }
  return lines.join('\n') + '\n';
}

module.exports = {
  enabled,
  inc,
  observeDuration,
  setGauge,
  httpRequest,
  executionRecorded,
  webhookLatency,
  walletTransfer,
  callbackReceived,
  setLedgerBalances,
  exportPrometheus,
};
