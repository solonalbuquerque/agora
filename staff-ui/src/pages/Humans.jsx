import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function Humans() {
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
    return api.humans(q)
      .then((r) => {
        console.log('Humans API response:', r);
        console.log('Humans API response.data:', r?.data);
        console.log('Humans API response.data.rows:', r?.data?.rows);
        const rows = Array.isArray(r?.data?.rows) ? r.data.rows : [];
        const total = Number(r?.data?.total) || 0;
        console.log('Humans parsed:', { rows, total, rowsLength: rows.length });
        setData({ rows, total });
      })
      .catch((err) => {
        console.error('Humans API error:', err);
        if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
          navigate('/login', { replace: true });
          return;
        }
        setData({ rows: [], total: 0 });
        setLoadError(err?.message || err?.code || 'Failed to load humans');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  const handleStatus = async (id, status) => {
    try {
      await api.updateHumanStatus(id, status);
      load();
    } catch (err) {
      alert(err?.message || 'Error');
    }
  };

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Humans" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <label>Filter by status</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: '10rem' }}>
          <option value="">All</option>
          <option value="pending">pending</option>
          <option value="verified">verified</option>
          <option value="banned">banned</option>
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
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td><code>{h.id}</code></td>
                  <td>{h.email}</td>
                  <td>{h.status}</td>
                  <td>{h.created_at ? new Date(h.created_at).toLocaleString() : '-'}</td>
                  <td>
                    {h.status !== 'verified' && <button type="button" onClick={() => handleStatus(h.id, 'verified')} style={{ marginRight: '0.25rem' }}>Verify</button>}
                    {h.status !== 'banned' && <button type="button" onClick={() => handleStatus(h.id, 'banned')}>Ban</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No humans yet.</p>}
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
