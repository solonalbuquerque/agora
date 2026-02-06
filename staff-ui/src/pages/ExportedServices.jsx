import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function ExportedServices() {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [instance, setInstance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [exportStatusFilter, setExportStatusFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const limit = 20;

  const load = () => {
    setError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (exportStatusFilter) q.export_status = exportStatusFilter;
    if (ownerFilter) q.owner_agent_id = ownerFilter;
    Promise.all([
      api.servicesExported(q),
      api.instance().catch(() => ({ data: null })),
    ])
      .then(([res, instRes]) => {
        setData({ rows: res?.data?.rows ?? [], total: res?.data?.total ?? 0 });
        setInstance(instRes?.data ?? null);
      })
      .catch((e) => {
        setData({ rows: [], total: 0 });
        setError(e?.message || 'Failed to load exported services');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, exportStatusFilter, ownerFilter]);

  const handleResumeExport = async (id) => {
    setActionLoading(id);
    try {
      await api.serviceResumeExport(id);
      load();
    } catch (e) {
      setError(e?.message || 'Resume failed');
    } finally {
      setActionLoading(null);
    }
  };

  const compliant = instance?.compliant === true;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <>
      <PageHeader title="Exported Services" onReload={load} loading={loading} />
      {!compliant && (
        <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid var(--error, #ef4444)', background: 'rgba(239,68,68,0.08)' }}>
          <strong>Instance not compliant — exports suspended.</strong>
          <p className="muted" style={{ marginBottom: 0 }}>Resume instance to Registered and use &quot;Resume export&quot; per service to re-enable.</p>
        </div>
      )}
      {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Export status</label>
            <select
              value={exportStatusFilter}
              onChange={(e) => { setPage(0); setExportStatusFilter(e.target.value); }}
              style={{ minWidth: '8rem' }}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label>Owner agent</label>
            <input
              type="text"
              value={ownerFilter}
              onChange={(e) => { setPage(0); setOwnerFilter(e.target.value); }}
              placeholder="Agent ID"
              style={{ minWidth: '12rem' }}
            />
          </div>
        </div>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Service ID</th>
                <th>Name</th>
                <th>Owner agent</th>
                <th>Webhook URL</th>
                <th>Visibility</th>
                <th>Export status</th>
                <th>Export reason</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/services/${s.id}`} style={{ color: '#a78bfa' }}>
                      <code title={s.id}>{String(s.id).slice(0, 12)}…</code>
                    </Link>
                  </td>
                  <td>{s.name}</td>
                  <td><code title={s.owner_agent_id}>{String(s.owner_agent_id).slice(0, 12)}…</code></td>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.webhook_url}>{s.webhook_url}</td>
                  <td>{s.visibility || 'local'}</td>
                  <td>
                    <span className={s.export_status === 'active' ? 'success' : s.export_status === 'suspended' ? 'error' : ''}>
                      {s.export_status || '—'}
                    </span>
                  </td>
                  <td>{s.export_reason || '—'}</td>
                  <td>{s.created_at ? new Date(s.created_at).toLocaleString() : '—'}</td>
                  <td>
                    {s.export_status === 'suspended' && compliant && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => handleResumeExport(s.id)}
                        disabled={actionLoading === s.id}
                      >
                        {actionLoading === s.id ? 'Resuming…' : 'Resume export'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="muted">No exported services.</p>}
          {total > limit && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="muted">Page {page + 1} ({(page * limit) + 1}–{Math.min((page + 1) * limit, total)} of {total})</span>
              <button type="button" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
