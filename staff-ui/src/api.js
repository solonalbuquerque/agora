const BASE = '';

function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  console.log('[api.request]', { path, url, options });
  return fetch(url, { credentials: 'include', ...options }).then(async (res) => {
    const text = await res.text();
    console.log('[api.request] Response:', { status: res.status, statusText: res.statusText, text });
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      console.error('[api.request] Error response:', { status: res.status, data });
      throw { status: res.status, ...data };
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
  agents: (q) => request(`/staff/api/agents?${new URLSearchParams(q || {})}`),
  createAgent: (name) => request('/staff/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
  getAgent: (id) => request(`/staff/api/agents/${id}`),
  updateAgentStatus: (id, status) => request(`/staff/api/agents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
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
  issuers: () => request('/staff/api/issuers'),
  coins: () => request('/staff/api/coins'),
  getCoin: (coin) => request(`/staff/api/coins/${coin}`),
  createCoin: (data) => request('/staff/api/coins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateCoin: (coin, data) => request(`/staff/api/coins/${coin}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteCoin: (coin) => request(`/staff/api/coins/${coin}`, { method: 'DELETE' }),
  rebalanceCoins: () => request('/staff/api/coins/rebalance', { method: 'POST' }),
  mint: (body) => request('/staff/mint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  setup2fa: () => request('/staff/2fa/setup', { method: 'POST' }),
};
