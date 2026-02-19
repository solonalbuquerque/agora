import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SearchFilter from '../components/SearchFilter';

export default function Services() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [ownerFilter, setOwnerFilter] = useState(searchParams.get('owner_agent_id') || '');
  const [creating, setCreating] = useState(false);
  const [agents, setAgents] = useState([]);
  const [coins, setCoins] = useState([]);
  const [formData, setFormData] = useState({
    owner_agent_id: '',
    name: '',
    description: '',
    webhook_url: '',
    price_cents: 0,
    coin: 'AGOTEST',
    export: false,
  });
  const limit = 20;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (statusFilter) q.status = statusFilter;
    if (searchQuery) q.q = searchQuery;
    if (ownerFilter) q.owner_agent_id = ownerFilter;
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

  useEffect(() => { load(); }, [page, statusFilter, searchQuery]);

  useEffect(() => {
    if (creating) {
      api.agents({ limit: 200 }).then((r) => setAgents(r?.data?.rows || [])).catch(() => setAgents([]));
      api.coins().then((r) => setCoins(r?.data?.rows || [])).catch(() => setCoins([]));
    }
  }, [creating]);

  const handleSearch = (q) => {
    setPage(0);
    setSearchQuery(q);
    const params = new URLSearchParams();
    if (ownerFilter) params.set('owner_agent_id', ownerFilter);
    if (q) params.set('q', q);
    setSearchParams(params);
  };

  const clearOwnerFilter = () => {
    setPage(0);
    setOwnerFilter('');
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    setSearchParams(params);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.owner_agent_id || !formData.name?.trim() || !formData.webhook_url?.trim()) {
      alert('Agent, name and webhook URL are required');
      return;
    }
    try {
      await api.createService({
        owner_agent_id: formData.owner_agent_id,
        name: formData.name.trim(),
        description: formData.description?.trim() || '',
        webhook_url: formData.webhook_url.trim(),
        price_cents: Number(formData.price_cents) || 0,
        coin: formData.coin || 'AGOTEST',
        export: !!formData.export,
      });
      setCreating(false);
      setFormData({ owner_agent_id: '', name: '', description: '', webhook_url: '', price_cents: 0, coin: 'AGOTEST', export: false });
      load();
    } catch (err) {
      alert(err?.message || 'Error creating service');
    }
  };

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Services" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        {!creating ? (
          <button type="button" className="primary" onClick={() => setCreating(true)}>New service</button>
        ) : (
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <label>Agent (owner)</label>
              <select
                value={formData.owner_agent_id}
                onChange={(e) => setFormData((d) => ({ ...d, owner_agent_id: e.target.value }))}
                required
              >
                <option value="">Select agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.id}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Name</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                placeholder="Service name"
                required
              />
            </div>
            <div className="form-row">
              <label>Webhook URL</label>
              <input
                type="url"
                value={formData.webhook_url}
                onChange={(e) => setFormData((d) => ({ ...d, webhook_url: e.target.value }))}
                placeholder="https://..."
                required
              />
            </div>
            <div className="form-row">
              <label>Description</label>
              <input
                value={formData.description}
                onChange={(e) => setFormData((d) => ({ ...d, description: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="form-row">
                <label>Price (cents)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.price_cents}
                  onChange={(e) => setFormData((d) => ({ ...d, price_cents: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <label>Coin</label>
                <select
                  value={formData.coin}
                  onChange={(e) => setFormData((d) => ({ ...d, coin: e.target.value }))}
                >
                  {coins.map((c) => (
                    <option key={c.coin} value={c.coin}>{c.coin}</option>
                  ))}
                  {coins.length === 0 && <option value="AGOTEST">AGOTEST</option>}
                </select>
              </div>
              <div className="form-row" style={{ alignItems: 'center', paddingTop: '1.5rem' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={formData.export}
                    onChange={(e) => setFormData((d) => ({ ...d, export: e.target.checked }))}
                  />
                  {' '}Export
                </label>
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button type="submit" className="primary">Create</button>
              <button type="button" onClick={() => { setCreating(false); setFormData({ owner_agent_id: '', name: '', description: '', webhook_url: '', price_cents: 0, coin: 'AGOTEST', export: false }); }} style={{ marginLeft: '0.5rem' }}>Cancel</button>
            </div>
          </form>
        )}
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        {ownerFilter && (
          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: '0.75rem' }}>Filtered by owner:</span>
            <code style={{ fontSize: '0.75rem' }}>{ownerFilter}</code>
            <button type="button" onClick={clearOwnerFilter} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Clear</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Filter by status</label>
            <select value={statusFilter} onChange={(e) => { setPage(0); setStatusFilter(e.target.value); }} style={{ maxWidth: '10rem' }}>
              <option value="">All</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="removed">removed</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label>Search</label>
            <SearchFilter
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search by name or description..."
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
                <th>Name</th>
                <th>Owner Agent</th>
                <th>Price</th>
                <th>Coin</th>
                <th>Status</th>
                <th>Visibility</th>
                <th>Export status</th>
                <th>Circuit breaker</th>
                <th>Webhook health</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/services/${s.id}`} style={{ color: '#a78bfa' }}>
                      <code title={s.id}>{s.id.slice(0, 12)}...</code>
                    </Link>
                  </td>
                  <td>{s.name}</td>
                  <td>
                    <Link to={`/agents/${s.owner_agent_id}`} style={{ color: '#a78bfa' }}>
                      <code title={s.owner_agent_id}>{s.owner_agent_id.slice(0, 8)}...</code>
                    </Link>
                  </td>
                  <td>{s.price_formated || (Number(s.price_cents) / 100).toFixed(2)}</td>
                  <td>{s.coin}</td>
                  <td>
                    <span style={{
                      padding: '0.125rem 0.375rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      backgroundColor: s.status === 'active' ? '#065f46' : s.status === 'removed' ? '#991b1b' : '#92400e',
                      color: '#fff'
                    }}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s.visibility ?? 'local'}</td>
                  <td>{s.export_status ?? '-'}</td>
                  <td>{s.circuit_breaker_state ?? '-'}</td>
                  <td>{s.webhook_health ?? '-'}</td>
                  <td>{s.created_at ? new Date(s.created_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No services found.</p>}
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
