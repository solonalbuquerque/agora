import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function Ledger() {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const limit = 50;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (typeFilter) q.type = typeFilter;
    return api.ledger(q)
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
        setLoadError(err?.message || 'Failed to load transactions');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, typeFilter]);

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Transactions (Ledger)" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <label>Filter by type</label>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ maxWidth: '10rem' }}>
          <option value="">All</option>
          <option value="credit">credit</option>
          <option value="debit">debit</option>
          <option value="transfer">transfer</option>
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
                <th>Agent</th>
                <th>Coin</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td><code>{r.agent_id}</code></td>
                  <td>{r.coin}</td>
                  <td>{r.type}</td>
                  <td>{Number(r.amount_cents).toLocaleString()}</td>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No transactions yet.</p>}
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
