import { useState, useEffect } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import { metrics as mockData } from '../data/mockSecurity';

export default function Metrics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [timeRange, setTimeRange] = useState('1h');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = () => {
    setLoadError('');
    setLoading(true);
    api.metrics({ range: timeRange })
      .then((r) => setData(r?.data ?? r ?? mockData))
      .catch((e) => {
        if (e?.status === 404 || e?.code === 'NOT_FOUND') {
          setData(mockData);
        } else {
          setLoadError(e?.message ?? 'Failed to load');
          setData(mockData);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [timeRange]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [autoRefresh, timeRange]);

  if (!data) {
    return <PageHeader title="Metrics" onReload={load} loading={loading} />;
  }

  const httpData = data.http_requests_per_minute || [];
  const execData = data.execution_success_vs_failure || { success: 0, failed: 0 };
  const webhookLatency = data.webhook_latency || { p50_ms: 0, p95_ms: 0 };
  const callbackRate = data.callback_success_rate ?? 0;
  const transfers = data.wallet_transfers_per_coin || [];

  return (
    <>
      <PageHeader title="Metrics" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label>Time range</label>
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} style={{ maxWidth: '10rem' }}>
            <option value="15m">Last 15 min</option>
            <option value="1h">Last 1 hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh (60s)
        </label>
      </div>
      {loadError && <p className="error" style={{ marginBottom: '1rem' }}>{loadError} (showing mock data)</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>HTTP requests per minute</h3>
          {httpData.length === 0 ? (
            <p className="muted">No data in selected period.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Time</th><th>Count</th></tr>
              </thead>
              <tbody>
                {httpData.map((row, i) => (
                  <tr key={i}>
                    <td>{row.ts ? new Date(row.ts).toLocaleTimeString() : row.time}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Execution success vs failure</h3>
          <table>
            <tbody>
              <tr><td>Success</td><td className="success">{execData.success ?? 0}</td></tr>
              <tr><td>Failed</td><td className="error">{execData.failed ?? 0}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Webhook latency</h3>
          <table>
            <tbody>
              <tr><td>p50</td><td>{webhookLatency.p50_ms ?? 0} ms</td></tr>
              <tr><td>p95</td><td>{webhookLatency.p95_ms ?? 0} ms</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Callback success rate</h3>
          <p style={{ fontSize: '1.5rem', margin: 0 }}>{(callbackRate * 100).toFixed(1)}%</p>
        </div>
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Wallet transfers per coin</h3>
          {transfers.length === 0 ? (
            <p className="muted">No transfers in selected period.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Coin</th><th>Count</th></tr>
              </thead>
              <tbody>
                {transfers.map((row, i) => (
                  <tr key={i}>
                    <td>{row.coin}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
