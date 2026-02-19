import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SearchFilter from '../components/SearchFilter';

export default function Humans() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const limit = 20;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (statusFilter) q.status = statusFilter;
    if (searchQuery) q.q = searchQuery;
    return api.humans(q)
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
        setLoadError(err?.message || err?.code || 'Failed to load humans');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, statusFilter, searchQuery]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    try {
      await api.createHuman(newEmail.trim());
      setNewEmail('');
      setCreating(false);
      load();
    } catch (err) {
      alert(err?.message || 'Error creating human');
    }
  };

  const handleStatus = async (id, status) => {
    try {
      await api.updateHumanStatus(id, status);
      load();
    } catch (err) {
      alert(err?.message || 'Error');
    }
  };

  const handleSearch = (q) => {
    setPage(0);
    setSearchQuery(q);
    if (q) {
      setSearchParams({ q });
    } else {
      setSearchParams({});
    }
  };

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Humans" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        {!creating ? (
          <button type="button" className="primary" onClick={() => setCreating(true)}>New human</button>
        ) : (
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <label>Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <button type="submit" className="primary">Create</button>
            <button type="button" onClick={() => { setCreating(false); setNewEmail(''); }} style={{ marginLeft: '0.5rem' }}>Cancel</button>
          </form>
        )}
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Filter by status</label>
            <select value={statusFilter} onChange={(e) => { setPage(0); setStatusFilter(e.target.value); }} style={{ maxWidth: '10rem' }}>
              <option value="">All</option>
              <option value="pending">pending</option>
              <option value="verified">verified</option>
              <option value="banned">banned</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label>Search</label>
            <SearchFilter
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search by ID or email..."
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
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link to={`/humans/${h.id}`} style={{ color: '#a78bfa' }}>
                      <code>{h.id}</code>
                    </Link>
                  </td>
                  <td>{h.email}</td>
                  <td>
                    <span style={{
                      padding: '0.125rem 0.375rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      backgroundColor: h.status === 'verified' ? '#065f46' : h.status === 'banned' ? '#991b1b' : '#92400e',
                      color: '#fff'
                    }}>
                      {h.status}
                    </span>
                  </td>
                  <td>{h.created_at ? new Date(h.created_at).toLocaleString() : '-'}</td>
                  <td>
                    {h.status !== 'verified' && <button type="button" onClick={() => handleStatus(h.id, 'verified')} style={{ marginRight: '0.25rem' }}>Verify</button>}
                    {h.status !== 'banned' && <button type="button" onClick={() => handleStatus(h.id, 'banned')}>Ban</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No humans found.</p>}
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
