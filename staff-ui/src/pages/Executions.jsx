import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SearchFilter from '../components/SearchFilter';

export default function Executions() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [requesterFilter, setRequesterFilter] = useState(searchParams.get('requester_agent_id') || '');
  const limit = 50;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (statusFilter) q.status = statusFilter;
    if (searchQuery) q.q = searchQuery;
    if (requesterFilter) q.requester_agent_id = requesterFilter;
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

  useEffect(() => { load(); }, [page, statusFilter, searchQuery]);

  const handleSearch = (q) => {
    setPage(0);
    setSearchQuery(q);
    const params = new URLSearchParams();
    if (requesterFilter) params.set('requester_agent_id', requesterFilter);
    if (q) params.set('q', q);
    setSearchParams(params);
  };

  const clearRequesterFilter = () => {
    setPage(0);
    setRequesterFilter('');
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    setSearchParams(params);
  };

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Executions" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        {requesterFilter && (
          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: '0.75rem' }}>Filtered by requester:</span>
            <code style={{ fontSize: '0.75rem' }}>{requesterFilter}</code>
            <button type="button" onClick={clearRequesterFilter} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Clear</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Filter by status</label>
            <select value={statusFilter} onChange={(e) => { setPage(0); setStatusFilter(e.target.value); }} style={{ maxWidth: '10rem' }}>
              <option value="">All</option>
              <option value="pending">pending</option>
              <option value="success">success</option>
              <option value="failed">failed</option>
              <option value="awaiting_callback">awaiting_callback</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label>Search</label>
            <SearchFilter
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search by UUID, requester ID, or service ID..."
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
                <th>Requester</th>
                <th>Service</th>
                <th>Status</th>
                <th>Idempotency key</th>
                <th>Request ID</th>
                <th>Callback status</th>
                <th>Latency (ms)</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/executions/${r.id}`} style={{ color: '#a78bfa' }}>
                      {r.id}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/agents/${r.requester_agent_id}`} style={{ color: '#a78bfa' }}>
                      <code title={r.requester_agent_id}>{r.requester_agent_id.slice(0, 12)}...</code>
                    </Link>
                  </td>
                  <td>
                    <Link to={`/services/${r.service_id}`} style={{ color: '#a78bfa' }}>
                      <code title={r.service_id}>{r.service_id.slice(0, 12)}...</code>
                    </Link>
                  </td>
                  <td>
                    <span style={{
                      padding: '0.125rem 0.375rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      backgroundColor: r.status === 'success' ? '#065f46' : r.status === 'failed' ? '#991b1b' : '#92400e',
                      color: '#fff'
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td><code style={{ fontSize: '0.75rem' }}>{r.idempotency_key ? `${r.idempotency_key.slice(0, 12)}...` : '-'}</code></td>
                  <td><code style={{ fontSize: '0.75rem' }}>{r.request_id ? `${r.request_id.slice(0, 10)}...` : '-'}</code></td>
                  <td>{r.callback_status ?? '-'}</td>
                  <td>{r.latency_ms ?? '-'}</td>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No executions found.</p>}
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
