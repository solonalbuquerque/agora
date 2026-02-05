import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SearchFilter from '../components/SearchFilter';

export default function Ledger() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [agentFilter, setAgentFilter] = useState(searchParams.get('agent_id') || '');
  const limit = 50;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (typeFilter) q.type = typeFilter;
    if (searchQuery) q.q = searchQuery;
    if (agentFilter) q.agent_id = agentFilter;
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

  useEffect(() => { load(); }, [page, typeFilter, searchQuery]);

  const handleSearch = (q) => {
    setPage(0);
    setSearchQuery(q);
    const params = new URLSearchParams();
    if (agentFilter) params.set('agent_id', agentFilter);
    if (q) params.set('q', q);
    setSearchParams(params);
  };

  const clearAgentFilter = () => {
    setPage(0);
    setAgentFilter('');
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    setSearchParams(params);
  };

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Transactions (Ledger)" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        {agentFilter && (
          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: '0.75rem' }}>Filtered by agent:</span>
            <code style={{ fontSize: '0.75rem' }}>{agentFilter}</code>
            <button type="button" onClick={clearAgentFilter} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Clear</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Filter by type</label>
            <select value={typeFilter} onChange={(e) => { setPage(0); setTypeFilter(e.target.value); }} style={{ maxWidth: '10rem' }}>
              <option value="">All</option>
              <option value="credit">credit</option>
              <option value="debit">debit</option>
              <option value="transfer">transfer</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label>Search</label>
            <SearchFilter
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search by agent ID, UUID, coin, or external ref..."
            />
          </div>
        </div>
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
                  <td>
                    <Link to={`/agents/${r.agent_id}`} style={{ color: '#a78bfa' }}>
                      <code>{r.agent_id}</code>
                    </Link>
                  </td>
                  <td>{r.coin}</td>
                  <td>
                    <span style={{
                      padding: '0.125rem 0.375rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      backgroundColor: r.type === 'credit' ? '#065f46' : r.type === 'debit' ? '#991b1b' : '#92400e',
                      color: '#fff'
                    }}>
                      {r.type}
                    </span>
                  </td>
                  <td>{Number(r.amount_cents).toLocaleString()}</td>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No transactions found.</p>}
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
