const BASE = '';

function parseResponseText(text, res, url) {
  if (!text || !text.trim()) return {};
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('[api.request] JSON parse failed:', e.message, { preview: text.slice(0, 100) });
      throw Object.assign(new Error(`Resposta inválida (não é JSON): ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`), { status: res.status, raw: text });
    }
  }
  console.error('[api.request] Response is not JSON:', { status: res.status, preview: text.slice(0, 150) });
  const msg = text.slice(0, 100).replace(/\s+/g, ' ');
  throw Object.assign(new Error(`Servidor retornou texto em vez de JSON (${res.status}): ${msg}${text.length > 100 ? '…' : ''}. Confira se esta página foi aberta na URL da instância (ex.: http://localhost:3000/staff), não na do Central.`), { status: res.status, raw: text });
}

function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  console.log('[api.request]', { path, url, options });
  return fetch(url, { credentials: 'include', ...options }).then(async (res) => {
    const text = await res.text();
    console.log('[api.request] Response:', { status: res.status, statusText: res.statusText, textLength: text?.length, preview: text?.slice(0, 80) });
    const data = parseResponseText(text, res, url);
    if (!res.ok) {
      console.error('[api.request] Error response:', { status: res.status, data });
      throw { status: res.status, message: data?.message || data?.code || res.statusText, ...data };
    }
    console.log('[api.request] Success:', data);
    return data;
  });
}

export const api = {
  login: (password) => request('/staff/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }),
  login2fa: (code) => request('/staff/login/2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }),
  logout: () => request('/staff/logout', { method: 'POST' }),
  config: () => request('/staff/api/config'),
  statistics: () => request('/staff/api/statistics'),
  dashboard: () => request('/staff/api/dashboard'),
  /** Force sync AGO events from Central (INSTANCE_CREDIT, CREDIT_INSTANCE). */
  centralSyncAgo: () => request('/staff/api/central/sync-ago', { method: 'POST' }),
  audit: (q) => request(`/staff/api/audit?${new URLSearchParams(q || {})}`),
  // B1/B2 Staff API (may return 404 until backend implements)
  securityOverview: () => request('/staff/api/security/overview'),
  rateLimits: (q) => request(`/staff/api/security/rate-limits?${new URLSearchParams(q || {})}`),
  rateLimitReset: (scope, identifier) => request(`/staff/api/security/rate-limits/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, identifier }) }),
  rateLimitBlock: (scope, identifier, durationSec) => request(`/staff/api/security/rate-limits/block`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, identifier, duration_sec: durationSec }) }),
  webhookSecurity: (q) => request(`/staff/api/services/webhook-security?${new URLSearchParams(q || {})}`),
  circuitBreakers: () => request('/staff/api/services/circuit-breakers'),
  circuitBreakerForceClose: (serviceId) => request(`/staff/api/services/${serviceId}/circuit-breaker/close`, { method: 'POST' }),
  callbacks: (q) => request(`/staff/api/executions/callbacks?${new URLSearchParams(q || {})}`),
  requests: (q) => request(`/staff/api/requests?${new URLSearchParams(q || {})}`),
  getRequest: (id) => request(`/staff/api/requests/${id}`),
  metrics: (q) => request(`/staff/api/metrics?${new URLSearchParams(q || {})}`),
  health: () => request('/staff/api/health'),
  dataRetention: () => request('/staff/api/data-retention'),
  dataRetentionUpdate: (body) => request('/staff/api/data-retention', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  dataRetentionPreview: () => request('/staff/api/data-retention/preview'),
  dataRetentionRun: () => request('/staff/api/data-retention/run', { method: 'POST' }),
  /** Download database backup as ZIP; returns Promise that resolves when download starts */
  downloadBackup: async () => {
    const url = `${BASE}/staff/api/backup`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      const text = await res.text();
      let err = { status: res.status };
      try { err = { ...err, ...JSON.parse(text) }; } catch (_) {}
      throw err;
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition');
    const match = disposition && disposition.match(/filename="?([^";]+)"?/);
    const filename = match ? match[1].trim() : `agora-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  },
  agents: (q) => request(`/staff/api/agents?${new URLSearchParams(q || {})}`),
  createAgent: (name) => request('/staff/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
  getAgent: (id) => request(`/staff/api/agents/${id}`),
  updateAgentStatus: (id, status) => request(`/staff/api/agents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
  updateAgent: (id, body) => request(`/staff/api/agents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  trustLevels: () => request('/staff/api/trust-levels'),
  updateTrustLevel: (level, body) => request(`/staff/api/trust-levels/${level}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  humans: (q) => request(`/staff/api/humans?${new URLSearchParams(q || {})}`),
  getHuman: (id) => request(`/staff/api/humans/${id}`),
  getHumanAgents: (id) => request(`/staff/api/humans/${id}/agents`),
  updateHumanStatus: (id, status) => request(`/staff/api/humans/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
  wallets: (q) => request(`/staff/api/wallets?${new URLSearchParams(q || {})}`),
  ledger: (q) => request(`/staff/api/ledger?${new URLSearchParams(q || {})}`),
  getLedgerEntry: (id) => request(`/staff/api/ledger/${id}`),
  executions: (q) => request(`/staff/api/executions?${new URLSearchParams(q || {})}`),
  getExecution: (id) => request(`/staff/api/executions/${id}`),
  services: (q) => request(`/staff/api/services?${new URLSearchParams(q || {})}`),
  getService: (id) => request(`/staff/api/services/${id}`),
  serviceResume: (id) => request(`/staff/api/services/${id}/resume`, { method: 'POST' }),
  servicePause: (id) => request(`/staff/api/services/${id}/pause`, { method: 'POST' }),
  issuers: () => request('/staff/api/issuers'),
  coins: () => request('/staff/api/coins'),
  getCoin: (coin) => request(`/staff/api/coins/${coin}`),
  createCoin: (data) => request('/staff/api/coins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateCoin: (coin, data) => request(`/staff/api/coins/${coin}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteCoin: (coin) => request(`/staff/api/coins/${coin}`, { method: 'DELETE' }),
  rebalanceCoins: () => request('/staff/api/coins/rebalance', { method: 'POST' }),
  mint: (body) => request('/staff/mint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  setup2fa: () => request('/staff/2fa/setup', { method: 'POST' }),
  instance: () => request('/staff/api/instance'),
  instanceUpdateStatus: (id, status) => request(`/staff/api/instance/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
  /** centerToken: Bearer JWT from Center (POST /human/login). Required when AGORA_CENTER_URL is set. */
  instanceRegister: (body, centerToken = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (centerToken?.trim()) headers.Authorization = centerToken.startsWith('Bearer ') ? centerToken.trim() : `Bearer ${centerToken.trim()}`;
    return request('/instance/register', { method: 'POST', headers, body: JSON.stringify(body) });
  },
  instanceActivate: (body, centerToken = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (centerToken?.trim()) headers.Authorization = centerToken.startsWith('Bearer ') ? centerToken.trim() : `Bearer ${centerToken.trim()}`;
    return request('/instance/activate', { method: 'POST', headers, body: JSON.stringify(body) });
  },
  bridge: (q) => request(`/staff/api/bridge?${new URLSearchParams(q || {})}`),
  getBridge: (id) => request(`/staff/api/bridge/${id}`),
  bridgeSettle: (id) => request(`/staff/api/bridge/${id}/settle`, { method: 'POST' }),
  bridgeReject: (id, reason) => request(`/staff/api/bridge/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason || null }) }),
  servicesExported: (q) => request(`/staff/api/services/exported?${new URLSearchParams(q || {})}`),
  serviceResumeExport: (id) => request(`/staff/api/services/${id}/resume-export`, { method: 'POST' }),
  settingsUpdate: (body) => request('/staff/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  /** Generate a new public bot registration key. Returns { registration_key } once; copy it. */
  generateRegistrationKey: () => request('/staff/api/settings/registration-key/generate', { method: 'POST' }),
};
