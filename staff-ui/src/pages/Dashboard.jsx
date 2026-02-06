import { useState, useEffect } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

const ENTITY_LABELS = {
  agents: 'Agents',
  humans: 'Humans',
  services: 'Services',
  executions: 'Executions',
  ledger_entries: 'Ledger entries',
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.dashboard().then((r) => r?.data ?? null).catch(() => null),
      api.statistics().then((r) => r?.data ?? null).catch(() => null),
    ])
      .then(([dash, stat]) => {
        setData(dash);
        setStats(stat);
      })
      .catch((e) => setError(e?.message ?? 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" onReload={load} loading={loading} />
        <p className="error">{error}</p>
      </>
    );
  }

  if (!data && !stats) {
    return <PageHeader title="Dashboard" onReload={load} loading={loading} />;
  }

  const exec24 = data?.executions_last_24h || {};
  const total24 = data?.executions_total_24h ?? 0;
  const errorRate = data?.error_rate_pct ?? 0;
  const paused = data?.paused_services_count ?? 0;
  const recentLedger = data?.recent_ledger || [];
  const recentAudit = data?.recent_audit || [];
  const totals = stats?.totals || {};
  const last24h = stats?.last_24h || {};
  const yesterday = stats?.yesterday || {};
  const pctVsYesterday = stats?.pct_vs_yesterday || {};

  return (
    <>
      <PageHeader title="Dashboard" onReload={load} loading={loading} />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Entity counts</h3>
        <p className="muted">Total, last 24 hours, yesterday, and % change vs yesterday.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Total</th>
              <th>Last 24h</th>
              <th>Yesterday</th>
              <th>% vs yesterday</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(ENTITY_LABELS).map((key) => (
              <tr key={key}>
                <td>{ENTITY_LABELS[key]}</td>
                <td>{totals[key] ?? 0}</td>
                <td>{last24h[key] ?? 0}</td>
                <td>{yesterday[key] ?? 0}</td>
                <td>
                  {pctVsYesterday[key] != null ? (
                    <span className={pctVsYesterday[key] >= 0 ? 'success' : ''}>
                      {pctVsYesterday[key] > 0 ? '+' : ''}{pctVsYesterday[key]}%
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Last 24 hours</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Executions total</th>
              <th>Error rate</th>
              <th>By status</th>
              <th>Paused services</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{total24}</td>
              <td>
                <span className={errorRate > 10 ? 'error' : ''}>{errorRate}%</span>
              </td>
              <td>
                pending: {exec24.pending ?? 0}, awaiting_callback: {exec24.awaiting_callback ?? 0}, success: {exec24.success ?? 0}, failed: {exec24.failed ?? 0}
              </td>
              <td>{paused}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Recent ledger</h3>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Agent</th>
              <th>Coin</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {recentLedger.length === 0 && (
              <tr>
                <td colSpan={6}>No entries</td>
              </tr>
            )}
            {recentLedger.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td><code>{r.agent_id?.slice(0, 8)}…</code></td>
                <td>{r.coin}</td>
                <td>{r.type}</td>
                <td>{r.amount_cents}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Recent audit events</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Actor</th>
              <th>Target</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {recentAudit.length === 0 && (
              <tr>
                <td colSpan={4}>No events</td>
              </tr>
            )}
            {recentAudit.map((r) => (
              <tr key={r.id}>
                <td><code>{r.event_type}</code></td>
                <td>{r.actor_type}{r.actor_id ? ` ${r.actor_id.slice(0, 8)}…` : ''}</td>
                <td>{r.target_type}{r.target_id ? ` ${r.target_id.slice(0, 8)}…` : ''}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
