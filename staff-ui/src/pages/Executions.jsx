import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function Executions() {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const limit = 50;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (statusFilter) q.status = statusFilter;
    return api.executions(q)
      .then((r) => {
        const rows = Array.isArray(r?.data?.rows) ? r.data.rows : [];
        const total = Number(r?.data?.total) || 0;
        setData({ rows, total });
      })
      .catch((err) => {
        if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
          navigate('/login', { replace: true });
          return;
        }
        setData({ rows: [], total: 0 });
        setLoadError(err?.message || 'Failed to load executions');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Executions" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <label>Filter by status</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: '10rem' }}>
          <option value="">All</option>
          <option value="pending">pending</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
          <option value="awaiting_callback">awaiting_callback</option>
        </select>
      </div>
      {loadError && <p className="error" style={{ marginBottom: '1rem' }}>{loadError}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Requester</th>
                <th>Service</th>
                <th>Status</th>
                <th>Latency (ms)</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td><code>{r.requester_agent_id}</code></td>
                  <td><code>{r.service_id}</code></td>
                  <td>{r.status}</td>
                  <td>{r.latency_ms ?? '-'}</td>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No executions yet.</p>}
          {total > limit && (
            <p style={{ marginTop: '1rem' }}>
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span style={{ margin: '0 1rem' }}>{page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}</span>
              <button type="button" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </p>
          )}
        </>
      )}
    </>
  );
}
