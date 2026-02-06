import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SearchFilter from '../components/SearchFilter';
import { rateLimits as mockData } from '../data/mockSecurity';

export default function RateLimits() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [scopeFilter, setScopeFilter] = useState(searchParams.get('scope') || '');
  const [endpointFilter, setEndpointFilter] = useState(searchParams.get('endpoint') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [actionLoading, setActionLoading] = useState(null);
  const limit = 50;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (scopeFilter) q.scope = scopeFilter;
    if (endpointFilter) q.endpoint = endpointFilter;
    if (statusFilter) q.status = statusFilter;
    if (searchQuery) q.q = searchQuery;
    api.rateLimits(q)
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
    if (scopeFilter) params.set('scope', scopeFilter);
    if (endpointFilter) params.set('endpoint', endpointFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (searchQuery) params.set('q', searchQuery);
    setSearchParams(params);
  }, [scopeFilter, endpointFilter, statusFilter, searchQuery]);

  useEffect(() => { load(); }, [page, scopeFilter, endpointFilter, statusFilter, searchQuery]);

  const handleReset = async (scope, identifier) => {
    setActionLoading(`${scope}:${identifier}`);
    try {
      await api.rateLimitReset(scope, identifier);
      load();
    } catch (e) {
      alert(e?.message ?? 'Reset failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBlock = async (scope, identifier) => {
    const dur = prompt('Block duration (seconds):', '3600');
    if (dur == null || dur === '') return;
    const sec = parseInt(dur, 10);
    if (isNaN(sec) || sec < 1) {
      alert('Invalid duration');
      return;
    }
    if (!confirm(`Block ${identifier} for ${sec} seconds?`)) return;
    setActionLoading(`block:${scope}:${identifier}`);
    try {
      await api.rateLimitBlock(scope, identifier, sec);
      load();
    } catch (e) {
      alert(e?.message ?? 'Block failed');
    } finally {
      setActionLoading(null);
    }
  };

  let rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || rows.length;

  if (scopeFilter) rows = rows.filter((r) => r.scope?.toLowerCase() === scopeFilter.toLowerCase());
  if (endpointFilter) rows = rows.filter((r) => (r.endpoint || '').includes(endpointFilter));
  if (statusFilter) rows = rows.filter((r) => (r.status || '').toLowerCase() === statusFilter.toLowerCase());
  if (searchQuery) rows = rows.filter((r) => (r.identifier || '').toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <>
      <PageHeader title="Rate Limits" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Scope</label>
            <select value={scopeFilter} onChange={(e) => { setPage(0); setScopeFilter(e.target.value); }} style={{ maxWidth: '10rem' }}>
              <option value="">All</option>
              <option value="Agent">Agent</option>
              <option value="Issuer">Issuer</option>
              <option value="IP">IP</option>
            </select>
          </div>
          <div>
            <label>Endpoint</label>
            <input value={endpointFilter} onChange={(e) => { setPage(0); setEndpointFilter(e.target.value); }} placeholder="e.g. /execute" style={{ maxWidth: '12rem' }} />
          </div>
          <div>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => { setPage(0); setStatusFilter(e.target.value); }} style={{ maxWidth: '10rem' }}>
              <option value="">All</option>
              <option value="OK">OK</option>
              <option value="Throttled">Throttled</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label>Search identifier</label>
            <SearchFilter value={searchQuery} onChange={(q) => { setPage(0); setSearchQuery(q); }} placeholder="Agent, issuer or IP..." />
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
                  <th>Scope</th>
                  <th>Identifier</th>
                  <th>Endpoint</th>
                  <th>Requests</th>
                  <th>Limit</th>
                  <th>Window (s)</th>
                  <th>Status</th>
                  <th>Last hit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.identifier || i}>
                    <td>{r.scope}</td>
                    <td><code>{r.identifier}</code></td>
                    <td><code>{r.endpoint}</code></td>
                    <td>{r.requests}</td>
                    <td>{r.limit}</td>
                    <td>{r.window_sec}</td>
                    <td>
                      <span style={{
                        padding: '0.125rem 0.375rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        backgroundColor: r.status === 'Throttled' ? '#991b1b' : '#065f46',
                        color: '#fff'
                      }}>{r.status}</span>
                    </td>
                    <td>{r.last_hit ? new Date(r.last_hit).toLocaleString() : '-'}</td>
                    <td>
                      <button type="button" className="small" disabled={!!actionLoading} onClick={() => handleReset(r.scope, r.identifier)} style={{ marginRight: '0.25rem' }}>Reset</button>
                      <button type="button" className="small danger" disabled={!!actionLoading} onClick={() => handleBlock(r.scope, r.identifier)}>Block</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && !loading && <p className="muted">No rate limit entries in selected filters.</p>}
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
