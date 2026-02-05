import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function Agents() {
  const navigate = useNavigate();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [secret, setSecret] = useState(null);
  const limit = 20;

  const load = () => {
    setLoadError('');
    setLoading(true);
    return api.agents({ limit, offset: page * limit })
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
        setLoadError(err?.message || 'Failed to load agents');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const r = await api.createAgent(newName.trim());
      setSecret(r.data);
      setNewName('');
      setCreating(false);
      load();
    } catch (err) {
      alert(err?.message || 'Error creating agent');
    }
  };

  const handleStatus = async (id, status) => {
    try {
      await api.updateAgentStatus(id, status);
      load();
    } catch (err) {
      alert(err?.message || 'Error');
    }
  };

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Agents" onReload={load} loading={loading} />
      <div className="card">
        {!creating ? (
          <button type="button" className="primary" onClick={() => setCreating(true)}>New agent</button>
        ) : (
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <label>Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Agent name" />
            </div>
            <button type="submit" className="primary">Create</button>
            <button type="button" onClick={() => { setCreating(false); setNewName(''); setSecret(null); }} style={{ marginLeft: '0.5rem' }}>Cancel</button>
          </form>
        )}
        {secret && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#a78bfa' }}>
            Agent created. ID: {secret.id} — Save the secret (shown once): <code>{secret.secret}</code>
          </p>
        )}
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
                <th>Status</th>
                <th>Trust</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><code>{a.id}</code></td>
                  <td>{a.name}</td>
                  <td>{a.status}</td>
                  <td>{a.trust_level}</td>
                  <td>{a.created_at ? new Date(a.created_at).toLocaleString() : '-'}</td>
                  <td>
                    {a.status !== 'active' && <button type="button" onClick={() => handleStatus(a.id, 'active')} style={{ marginRight: '0.25rem' }}>Activate</button>}
                    {a.status !== 'limited' && <button type="button" onClick={() => handleStatus(a.id, 'limited')} style={{ marginRight: '0.25rem' }}>Limit</button>}
                    {a.status !== 'banned' && <button type="button" onClick={() => handleStatus(a.id, 'banned')}>Ban</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No agents yet. Create one above.</p>}
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
