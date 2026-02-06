import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SearchFilter from '../components/SearchFilter';
import { callbacks as mockData } from '../data/mockSecurity';

export default function Callbacks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [tokenStatusFilter, setTokenStatusFilter] = useState(searchParams.get('token_status') || '');
  const [fromDate, setFromDate] = useState(searchParams.get('from') || '');
  const [toDate, setToDate] = useState(searchParams.get('to') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const limit = 50;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (statusFilter) q.status = statusFilter;
    if (tokenStatusFilter) q.token_status = tokenStatusFilter;
    if (fromDate) q.from_date = fromDate;
    if (toDate) q.to_date = toDate;
    if (searchQuery) q.q = searchQuery;
    api.callbacks(q)
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

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (tokenStatusFilter) params.set('token_status', tokenStatusFilter);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    if (searchQuery) params.set('q', searchQuery);
    setSearchParams(params);
  }, [statusFilter, tokenStatusFilter, fromDate, toDate, searchQuery]);

  useEffect(() => { load(); }, [page, statusFilter, tokenStatusFilter, fromDate, toDate, searchQuery]);

  let rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || rows.length;
  if (statusFilter) rows = rows.filter((r) => (r.status || '').toLowerCase() === statusFilter.toLowerCase());
  if (tokenStatusFilter) rows = rows.filter((r) => (r.callback_token_status || '').toLowerCase() === tokenStatusFilter.toLowerCase());
  if (searchQuery) rows = rows.filter((r) => (r.execution_id || '').toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <>
      <PageHeader title="Callback Security" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => { setPage(0); setStatusFilter(e.target.value); }} style={{ maxWidth: '12rem' }}>
              <option value="">All</option>
              <option value="success">success</option>
              <option value="failed">failed</option>
              <option value="awaiting_callback">awaiting_callback</option>
            </select>
          </div>
          <div>
            <label>Token status</label>
            <select value={tokenStatusFilter} onChange={(e) => { setPage(0); setTokenStatusFilter(e.target.value); }} style={{ maxWidth: '10rem' }}>
              <option value="">All</option>
              <option value="Valid">Valid</option>
              <option value="Used">Used</option>
              <option value="Expired">Expired</option>
            </select>
          </div>
          <div>
            <label>From date</label>
            <input type="date" value={fromDate} onChange={(e) => { setPage(0); setFromDate(e.target.value); }} style={{ maxWidth: '10rem' }} />
          </div>
          <div>
            <label>To date</label>
            <input type="date" value={toDate} onChange={(e) => { setPage(0); setToDate(e.target.value); }} style={{ maxWidth: '10rem' }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label>Search execution</label>
            <SearchFilter value={searchQuery} onChange={(q) => { setPage(0); setSearchQuery(q); }} placeholder="Execution ID..." />
          </div>
        </div>
      </div>
      {loadError && <p className="error" style={{ marginBottom: '1rem' }}>{loadError} (showing mock data)</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Execution ID</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Token status</th>
                  <th>Callback received at</th>
                  <th>Rejected reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.execution_id}>
                    <td>
                      <Link to={`/executions/${r.execution_id}`} style={{ color: '#a78bfa' }}><code>{r.execution_id}</code></Link>
                    </td>
                    <td>
                      <Link to={`/services/${r.service_id}`} style={{ color: '#a78bfa' }}>{r.service_name || r.service_id}</Link>
                    </td>
                    <td>
                      <span style={{
                        padding: '0.125rem 0.375rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        backgroundColor: r.status === 'success' ? '#065f46' : r.status === 'failed' ? '#991b1b' : '#92400e',
                        color: '#fff'
                      }}>{r.status}</span>
                    </td>
                    <td>{r.callback_token_status ?? '-'}</td>
                    <td>{r.callback_received_at ? new Date(r.callback_received_at).toLocaleString() : '-'}</td>
                    <td>{r.rejected_reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && !loading && <p className="muted">No callbacks in selected period.</p>}
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
