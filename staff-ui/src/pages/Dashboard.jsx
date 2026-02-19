import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

const ENTITY_LABELS = {
  agents: 'Agents',
  humans: 'Humans',
  services: 'Services',
  executions: 'Executions',
  ledger_entries: 'Ledger entries',
};

const STATUS_STYLE = {
  registered: { label: 'Registered', className: 'instance-badge instance-badge-ok' },
  pending: { label: 'Pending', className: 'instance-badge instance-badge-pending' },
  flagged: { label: 'Flagged', className: 'instance-badge instance-badge-warn' },
  blocked: { label: 'Blocked', className: 'instance-badge instance-badge-error' },
  unregistered: { label: 'Unregistered', className: 'instance-badge instance-badge-muted' },
};

function copyToClipboard(text, setFeedback) {
  if (!navigator?.clipboard?.writeText) {
    setFeedback?.('Copy not supported');
    return;
  }
  navigator.clipboard.writeText(text).then(() => setFeedback?.('Copied!')).catch(() => setFeedback?.('Failed'));
  if (setFeedback) setTimeout(() => setFeedback(''), 2000);
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [syncAgoLoading, setSyncAgoLoading] = useState(false);
  const [syncAgoFeedback, setSyncAgoFeedback] = useState('');

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

  const instanceSummary = data?.instance_summary ?? null;
  const baseUrl = data?.base_url ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const bridgePending = data?.bridge_pending_summary ?? { count: 0, total_cents: 0 };
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

  const manifestUrl = baseUrl ? `${baseUrl}/.well-known/agora.json` : '';
  const docsUrl = baseUrl ? `${baseUrl}/docs` : '';
  const centralSyncAvailable = data?.central_sync_available ?? false;
  const centralUrl = data?.agora_center_url ?? null;
  const centralAgoCents = data?.central_ago_cents ?? 0;
  const centralAgoUnits = (Number(centralAgoCents) / 100).toFixed(2);
  const centralPolicy = data?.central_policy_summary ?? null;

  const handleSyncAgo = () => {
    setSyncAgoLoading(true);
    setSyncAgoFeedback('');
    api.centralSyncAgo()
      .then(() => {
        setSyncAgoFeedback('Sync completed.');
        load();
        setTimeout(() => setSyncAgoFeedback(''), 4000);
      })
      .catch((e) => {
        setSyncAgoFeedback(e?.message || 'Sync failed.');
        setTimeout(() => setSyncAgoFeedback(''), 4000);
      })
      .finally(() => setSyncAgoLoading(false));
  };

  return (
    <>
      <PageHeader title="Dashboard" onReload={load} loading={loading} />

      <div className="card instance-dashboard-card dashboard-central-card">
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span aria-hidden>◇</span> Central
        </h3>
        {!centralUrl ? (
          <div className="instance-empty">
            <p className="muted">Central not configured.</p>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Set <code>AGORA_CENTER_URL</code> in <code>.env</code>. Instance ID and token can be set in Instance panel after registration.
            </p>
            <Link to="/instance" style={{ display: 'inline-block', marginTop: '0.5rem' }}>Configure in Instance →</Link>
          </div>
        ) : (
          <div className="instance-grid dashboard-central-grid">
            <div className="instance-block">
              <label>Central URL</label>
              <div className="instance-id-row">
                <code className="instance-id" title={centralUrl}>{centralUrl}</code>
                <button
                  type="button"
                  className="secondary"
                  style={{ flexShrink: 0 }}
                  onClick={() => copyToClipboard(centralUrl, setCopyFeedback)}
                  title="Copy"
                >
                  Copy
                </button>
                {copyFeedback && <span className="instance-copy-feedback">{copyFeedback}</span>}
              </div>
            </div>
            <div className="instance-block">
              <label>AGO balance (instance)</label>
              <div className="instance-sync-value instance-ago-balance">
                <strong>{centralAgoUnits}</strong> AGO
              </div>
            </div>
            {centralPolicy && (
              <>
                <div className="instance-block">
                  <label>Trust level (Central)</label>
                  <span className={`instance-badge instance-badge-${centralPolicy.trust_level === 'verified' ? 'ok' : centralPolicy.trust_level === 'unverified' ? 'muted' : 'pending'}`}>
                    {centralPolicy.trust_level ?? '—'}
                  </span>
                </div>
                <div className="instance-block">
                  <label>Visibility (Central)</label>
                  <span>{centralPolicy.visibility_status ?? '—'}</span>
                </div>
                <div className="instance-block">
                  <label>Policy updated at</label>
                  <span>{centralPolicy.updated_at ? new Date(centralPolicy.updated_at).toLocaleString() : '—'}</span>
                </div>
              </>
            )}
            <div className="instance-sync-block">
              <label>Bridge pending (outbound)</label>
              <div className="instance-sync-value">
                <strong>{bridgePending.count}</strong> transfer(s) · <strong>{(Number(bridgePending.total_cents) / 100).toFixed(2)}</strong> AGO
              </div>
              {bridgePending.count > 0 && (
                <Link to="/bridge" className="secondary" style={{ display: 'inline-block', marginTop: '0.5rem' }}>View Bridge →</Link>
              )}
            </div>
            {centralSyncAvailable && (
              <div className="instance-sync-block">
                <label>AGO sync (inbound)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="primary"
                    disabled={syncAgoLoading}
                    onClick={handleSyncAgo}
                  >
                    {syncAgoLoading ? 'Syncing…' : 'Force sync'}
                  </button>
                  {syncAgoFeedback && (
                    <span className={syncAgoFeedback.startsWith('Sync completed') ? 'success' : 'error'} style={{ fontSize: '0.9rem' }}>
                      {syncAgoFeedback}
                    </span>
                  )}
                </div>
                <p className="muted" style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>
                  Fetches INSTANCE_CREDIT/CREDIT_INSTANCE from Central and credits agents.
                </p>
              </div>
            )}
            <div className="instance-urls">
              <label>Actions</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <Link to="/instance">Instance</Link>
                <Link to="/bridge">Bridge</Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card instance-dashboard-card">
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span aria-hidden>◇</span> Instance &amp; compliance
        </h3>
        {!instanceSummary ? (
          <div className="instance-empty">
            <p><strong>No instance registered</strong></p>
            <p className="muted">
              Register or link an instance in the Instance panel. Instance ID and token are saved automatically.
            </p>
            <Link to="/instance" className="primary" style={{ display: 'inline-block', marginTop: '0.5rem' }}>Open Instance →</Link>
          </div>
        ) : (
          <div className="instance-grid">
            {instanceSummary.name && (
              <div className="instance-block">
                <label>Name</label>
                <span>{instanceSummary.name}</span>
              </div>
            )}
            {instanceSummary.slug && (
              <div className="instance-block">
                <label>Slug</label>
                <code>{instanceSummary.slug}</code>
              </div>
            )}
            <div className="instance-block">
              <label>Instance ID</label>
              <div className="instance-id-row">
                <code className="instance-id">{instanceSummary.instance_id}</code>
                <button
                  type="button"
                  className="secondary"
                  style={{ flexShrink: 0 }}
                  onClick={() => copyToClipboard(instanceSummary.instance_id, setCopyFeedback)}
                  title="Copy"
                >
                  Copy
                </button>
                {copyFeedback && <span className="instance-copy-feedback">{copyFeedback}</span>}
              </div>
              <p className="muted" style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>
                Use as <code>INSTANCE_ID</code> in <code>.env</code> for this deployment.
              </p>
            </div>
            <div className="instance-block">
              <label>Status</label>
              <span className={STATUS_STYLE[instanceSummary.status]?.className ?? 'instance-badge'}>
                {STATUS_STYLE[instanceSummary.status]?.label ?? instanceSummary.status}
              </span>
            </div>
            <div className="instance-block">
              <label>Compliant</label>
              <span className={instanceSummary.compliant ? 'success' : 'error'}>
                {instanceSummary.compliant ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="instance-block">
              <label>Export services</label>
              <span>{instanceSummary.export_services_enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="instance-block">
              <label>Last seen</label>
              <span>{instanceSummary.last_seen_at ? new Date(instanceSummary.last_seen_at).toLocaleString() : '—'}</span>
            </div>
            <div className="instance-urls">
              <label>Quick links</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                {manifestUrl && (
                  <button type="button" className="secondary" onClick={() => copyToClipboard(manifestUrl, setCopyFeedback)} title={manifestUrl}>
                    Copy manifest URL
                  </button>
                )}
                {docsUrl && (
                  <button type="button" className="secondary" onClick={() => copyToClipboard(docsUrl, setCopyFeedback)} title={docsUrl}>
                    Copy docs URL
                  </button>
                )}
                <Link to="/instance">Instance</Link>
              </div>
            </div>
          </div>
        )}
      </div>

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
