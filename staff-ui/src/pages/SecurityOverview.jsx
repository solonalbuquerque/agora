import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import { securityOverview as mockData } from '../data/mockSecurity';

function SecurityWidget({ title, count, pctChange, link, linkLabel }) {
  const pctClass = pctChange == null ? '' : pctChange >= 0 ? 'error' : 'success';
  return (
    <div className="card" style={{ flex: '1 1 200px', minWidth: '180px' }}>
      <div style={{ fontSize: '0.875rem', color: '#a1a1aa', marginBottom: '0.25rem' }}>{title}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{count ?? 0}</div>
      {pctChange != null && (
        <span className={pctClass} style={{ fontSize: '0.75rem' }}>
          {pctChange >= 0 ? '+' : ''}{pctChange}% vs previous period
        </span>
      )}
      {link && (
        <div style={{ marginTop: '0.5rem' }}>
          <Link to={link} style={{ fontSize: '0.8rem' }}>{linkLabel || 'View details →'}</Link>
        </div>
      )}
    </div>
  );
}

export default function SecurityOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.securityOverview()
      .then((r) => setData(r?.data ?? r))
      .catch((e) => {
        if (e?.status === 404 || e?.code === 'NOT_FOUND') {
          setData(mockData);
        } else {
          setError(e?.message ?? 'Failed to load');
          setData(mockData);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Security Overview" onReload={load} loading={loading} />
        <p className="error" style={{ marginBottom: '1rem' }}>{error} (showing mock data)</p>
      </>
    );
  }

  if (!data) {
    return <PageHeader title="Security Overview" onReload={load} loading={loading} />;
  }

  const widgets = [
    { key: 'failed_auth_24h', title: 'Failed authentication attempts (24h)', ...data.failed_auth_24h, link: '/audit?event_type=AUTH_FAILURE' },
    { key: 'rate_limit_violations_24h', title: 'Rate limit violations (24h)', ...data.rate_limit_violations_24h, link: '/rate-limits?status=throttled' },
    { key: 'blocked_webhooks_24h', title: 'Blocked webhooks (SSRF/invalid URL)', ...data.blocked_webhooks_24h, link: '/webhook-security?status=failing' },
    { key: 'circuit_breakers_triggered', title: 'Circuit breakers triggered', ...data.circuit_breakers_triggered, link: '/circuit-breakers' },
    { key: 'idempotency_replays_prevented', title: 'Idempotency replays prevented', ...data.idempotency_replays_prevented, link: '/executions' },
    { key: 'callback_rejections', title: 'Callback rejections (expired/replay)', ...data.callback_rejections, link: '/callbacks?token_status=expired' },
  ];

  return (
    <>
      <PageHeader title="Security Overview" onReload={load} loading={loading} />
      <p className="muted" style={{ marginBottom: '1rem' }}>High-level visibility of security events and risks (last 24h vs previous period).</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        {widgets.map((w) => (
          <SecurityWidget
            key={w.key}
            title={w.title}
            count={w.count}
            pctChange={w.pct_change}
            link={w.link}
          />
        ))}
      </div>
    </>
  );
}
