import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SearchFilter from '../components/SearchFilter';
import SlideModal from '../components/SlideModal';
import { requests as mockData } from '../data/mockSecurity';

export default function Requests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [methodFilter, setMethodFilter] = useState(searchParams.get('method') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [pathFilter, setPathFilter] = useState(searchParams.get('path') || '');
  const [agentFilter, setAgentFilter] = useState(searchParams.get('agent_id') || '');
  const [fromDate, setFromDate] = useState(searchParams.get('from') || '');
  const [toDate, setToDate] = useState(searchParams.get('to') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const limit = 50;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (methodFilter) q.method = methodFilter;
    if (statusFilter) q.status = statusFilter;
    if (pathFilter) q.path = pathFilter;
    if (agentFilter) q.agent_id = agentFilter;
    if (fromDate) q.from_date = fromDate;
    if (toDate) q.to_date = toDate;
    if (searchQuery) q.q = searchQuery;
    api.requests(q)
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
    if (methodFilter) params.set('method', methodFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (pathFilter) params.set('path', pathFilter);
    if (agentFilter) params.set('agent_id', agentFilter);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    if (searchQuery) params.set('q', searchQuery);
    setSearchParams(params);
  }, [methodFilter, statusFilter, pathFilter, agentFilter, fromDate, toDate, searchQuery]);

  useEffect(() => { load(); }, [page, methodFilter, statusFilter, pathFilter, agentFilter, fromDate, toDate, searchQuery]);

  const openTimeline = (r) => {
    setSelectedRequest(r);
    api.getRequest?.(r.request_id)
      .then((d) => setSelectedRequest((prev) => ({ ...prev, timeline: d?.data?.timeline ?? d?.timeline })))
      .catch(() => setSelectedRequest((prev) => ({ ...prev, timeline: null })));
  };

  let rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || rows.length;
  if (methodFilter) rows = rows.filter((r) => (r.method || '').toUpperCase() === methodFilter.toUpperCase());
  if (statusFilter) rows = rows.filter((r) => String(r.status || '').startsWith(statusFilter));
  if (pathFilter) rows = rows.filter((r) => (r.path || '').includes(pathFilter));
  if (agentFilter) rows = rows.filter((r) => (r.agent_id || '').includes(agentFilter));
  if (searchQuery) rows = rows.filter((r) => (r.request_id || '').toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <>
      <PageHeader title="Requests & Tracing" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Method</label>
            <select value={methodFilter} onChange={(e) => { setPage(0); setMethodFilter(e.target.value); }} style={{ maxWidth: '8rem' }}>
              <option value="">All</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label>Status</label>
            <input value={statusFilter} onChange={(e) => { setPage(0); setStatusFilter(e.target.value); }} placeholder="e.g. 200, 429" style={{ maxWidth: '6rem' }} />
          </div>
          <div>
            <label>Path</label>
            <input value={pathFilter} onChange={(e) => { setPage(0); setPathFilter(e.target.value); }} placeholder="e.g. /execute" style={{ maxWidth: '12rem' }} />
          </div>
          <div>
            <label>Agent / Issuer</label>
            <input value={agentFilter} onChange={(e) => { setPage(0); setAgentFilter(e.target.value); }} placeholder="ID" style={{ maxWidth: '12rem' }} />
          </div>
          <div>
            <label>From</label>
            <input type="datetime-local" value={fromDate} onChange={(e) => { setPage(0); setFromDate(e.target.value); }} style={{ maxWidth: '12rem' }} />
          </div>
          <div>
            <label>To</label>
            <input type="datetime-local" value={toDate} onChange={(e) => { setPage(0); setToDate(e.target.value); }} style={{ maxWidth: '12rem' }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label>Search request ID</label>
            <SearchFilter value={searchQuery} onChange={(q) => { setPage(0); setSearchQuery(q); }} placeholder="Request ID..." />
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
                  <th>Request ID</th>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Status</th>
                  <th>Duration (ms)</th>
                  <th>Agent ID</th>
                  <th>Issuer ID</th>
                  <th>Instance</th>
                  <th>Timestamp</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.request_id}>
                    <td><code>{r.request_id}</code></td>
                    <td>{r.method}</td>
                    <td><code>{r.path}</code></td>
                    <td>
                      <span style={{
                        padding: '0.125rem 0.375rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        backgroundColor: r.status >= 400 ? '#991b1b' : r.status >= 300 ? '#92400e' : '#065f46',
                        color: '#fff'
                      }}>{r.status}</span>
                    </td>
                    <td>{r.duration_ms ?? '-'}</td>
                    <td>{r.agent_id ? <Link to={`/agents/${r.agent_id}`} style={{ color: '#a78bfa' }}><code>{r.agent_id.slice(0, 8)}...</code></Link> : '-'}</td>
                    <td>{r.issuer_id ? <code>{r.issuer_id.slice(0, 8)}...</code> : '-'}</td>
                    <td>{r.instance_id ?? '-'}</td>
                    <td>{r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</td>
                    <td>
                      <button type="button" className="small" onClick={() => openTimeline(r)}>Timeline</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && !loading && <p className="muted">No requests in selected period.</p>}
          {total > limit && (
            <p style={{ marginTop: '1rem' }}>
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span style={{ margin: '0 1rem' }}>{page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}</span>
              <button type="button" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </p>
          )}
        </>
      )}
      <SlideModal isOpen={!!selectedRequest} onClose={() => setSelectedRequest(null)} title="Request timeline">
        {selectedRequest && (
          <div>
            <p><strong>Request ID:</strong> <code>{selectedRequest.request_id}</code></p>
            <p><strong>Method:</strong> {selectedRequest.method} <strong>Path:</strong> {selectedRequest.path}</p>
            <p><strong>Status:</strong> {selectedRequest.status} | <strong>Duration:</strong> {selectedRequest.duration_ms} ms</p>
            {selectedRequest.timeline ? (
              <pre style={{ background: '#27272a', padding: '1rem', borderRadius: '6px', overflow: 'auto', fontSize: '0.8rem' }}>
                {JSON.stringify(selectedRequest.timeline, null, 2)}
              </pre>
            ) : (
              <p className="muted">Full timeline not available (backend not implemented).</p>
            )}
          </div>
        )}
      </SlideModal>
    </>
  );
}
