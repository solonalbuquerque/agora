import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function Services() {
  const navigate = useNavigate();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const limit = 20;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (statusFilter) q.status = statusFilter;
    return api.services(q)
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
        setLoadError(err?.message || err?.code || 'Failed to load services');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Services" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <label>Filter by status</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: '10rem' }}>
          <option value="">All</option>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="removed">removed</option>
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
                <th>Name</th>
                <th>Owner Agent</th>
                <th>Price</th>
                <th>Coin</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><code title={s.id}>{s.id.slice(0, 12)}...</code></td>
                  <td>{s.name}</td>
                  <td><code title={s.owner_agent_id}>{s.owner_agent_id.slice(0, 8)}...</code></td>
                  <td>{(Number(s.price_cents) / 100).toFixed(2)}</td>
                  <td>{s.coin}</td>
                  <td>{s.status}</td>
                  <td>{s.created_at ? new Date(s.created_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No services yet.</p>}
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
