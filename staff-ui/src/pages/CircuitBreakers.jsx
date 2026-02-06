import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import { circuitBreakers as mockData } from '../data/mockSecurity';

export default function CircuitBreakers() {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const load = () => {
    setLoadError('');
    setLoading(true);
    api.circuitBreakers()
      .then((r) => {
        const rows = Array.isArray(r?.data?.rows) ? r.data.rows : r?.rows ?? [];
        const total = Number(r?.data?.total ?? r?.total) || rows.length;
        setData({ rows, total });
      })
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

  useEffect(() => { load(); }, []);

  const handleForceClose = async (serviceId) => {
    if (!confirm('Force close circuit breaker for this service? It will allow new requests.')) return;
    setActionLoading(serviceId);
    try {
      await api.circuitBreakerForceClose(serviceId);
      load();
    } catch (e) {
      alert(e?.message ?? 'Force close failed (backend not implemented)');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (serviceId) => {
    if (!confirm('Pause this service?')) return;
    try {
      await api.servicePause?.(serviceId) ?? Promise.reject(new Error('Not implemented'));
      load();
    } catch (e) {
      alert(e?.message ?? 'Pause failed');
    }
  };

  const rows = Array.isArray(data?.rows) ? data.rows : [];

  return (
    <>
      <PageHeader title="Circuit Breakers" onReload={load} loading={loading} />
      {loadError && <p className="error" style={{ marginBottom: '1rem' }}>{loadError} (showing mock data)</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Service ID</th>
                  <th>Service Name</th>
                  <th>Breaker State</th>
                  <th>Failure threshold</th>
                  <th>Failures counted</th>
                  <th>Opened at</th>
                  <th>Last success</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.service_id}>
                    <td>
                      <Link to={`/services/${r.service_id}`} style={{ color: '#a78bfa' }}><code>{r.service_id?.slice(0, 12)}...</code></Link>
                    </td>
                    <td>{r.service_name}</td>
                    <td>
                      <span style={{
                        padding: '0.125rem 0.375rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        backgroundColor: r.breaker_state === 'Open' ? '#991b1b' : '#065f46',
                        color: '#fff'
                      }}>{r.breaker_state}</span>
                    </td>
                    <td>{r.failure_threshold}</td>
                    <td>{r.failures_counted}</td>
                    <td>{r.opened_at ? new Date(r.opened_at).toLocaleString() : '-'}</td>
                    <td>{r.last_success ? new Date(r.last_success).toLocaleString() : '-'}</td>
                    <td>
                      {r.breaker_state === 'Open' && (
                        <button type="button" className="small" disabled={!!actionLoading} onClick={() => handleForceClose(r.service_id)} style={{ marginRight: '0.25rem' }}>Force close</button>
                      )}
                      <button type="button" className="small" onClick={() => handlePause(r.service_id)}>Pause service</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && !loading && <p className="muted">No circuit breakers configured.</p>}
        </>
      )}
    </>
  );
}
