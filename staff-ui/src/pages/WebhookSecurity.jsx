import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SlideModal from '../components/SlideModal';
import { webhookSecurity as mockData } from '../data/mockSecurity';

export default function WebhookSecurity() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [ownerFilter, setOwnerFilter] = useState(searchParams.get('owner_agent_id') || '');
  const [failureFilter, setFailureFilter] = useState(searchParams.get('failure_count') || '');
  const [modalRow, setModalRow] = useState(null);

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = {};
    if (statusFilter) q.status = statusFilter;
    if (ownerFilter) q.owner_agent_id = ownerFilter;
    if (failureFilter) q.failure_count = failureFilter;
    api.webhookSecurity(q)
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
    if (ownerFilter) params.set('owner_agent_id', ownerFilter);
    if (failureFilter) params.set('failure_count', failureFilter);
    setSearchParams(params);
  }, [statusFilter, ownerFilter, failureFilter]);

  useEffect(() => { load(); }, [statusFilter, ownerFilter, failureFilter]);

  const handleResume = async (id) => {
    try {
      await api.serviceResume?.(id) ?? Promise.reject(new Error('Not implemented'));
      load();
    } catch (e) {
      alert(e?.message ?? 'Resume failed (backend not implemented)');
    }
  };

  const handlePause = async (id) => {
    if (!confirm('Pause this service?')) return;
    try {
      await api.servicePause?.(id) ?? Promise.reject(new Error('Not implemented'));
      load();
    } catch (e) {
      alert(e?.message ?? 'Pause failed (backend not implemented)');
    }
  };

  let rows = Array.isArray(data?.rows) ? data.rows : [];
  if (statusFilter) rows = rows.filter((r) => (r.status || '').toLowerCase() === statusFilter.toLowerCase());
  if (ownerFilter) rows = rows.filter((r) => (r.owner_agent_id || '').includes(ownerFilter));
  if (failureFilter) {
    const n = parseInt(failureFilter, 10);
    if (!isNaN(n)) rows = rows.filter((r) => (r.consecutive_failures || 0) >= n);
  }

  return (
    <>
      <PageHeader title="Webhook Security" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: '10rem' }}>
              <option value="">All</option>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
            </select>
          </div>
          <div>
            <label>Owner Agent</label>
            <input value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} placeholder="Agent ID" style={{ maxWidth: '14rem' }} />
          </div>
          <div>
            <label>Min failures</label>
            <input type="number" min={0} value={failureFilter} onChange={(e) => setFailureFilter(e.target.value)} placeholder="0" style={{ maxWidth: '6rem' }} />
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
                  <th>Service ID</th>
                  <th>Service Name</th>
                  <th>Owner Agent</th>
                  <th>Webhook URL</th>
                  <th>Status</th>
                  <th>Failures</th>
                  <th>Last error</th>
                  <th>Last attempt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.service_id}>
                    <td>
                      <Link to={`/services/${r.service_id}`} style={{ color: '#a78bfa' }}><code>{r.service_id?.slice(0, 12)}...</code></Link>
                    </td>
                    <td>{r.service_name}</td>
                    <td>
                      <Link to={`/agents/${r.owner_agent_id}`} style={{ color: '#a78bfa' }}><code>{r.owner_agent_id?.slice(0, 8)}...</code></Link>
                    </td>
                    <td><code style={{ fontSize: '0.75rem' }} title={r.webhook_url}>{r.webhook_url?.slice(0, 40)}...</code></td>
                    <td>
                      <span style={{
                        padding: '0.125rem 0.375rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        backgroundColor: r.status === 'Active' ? '#065f46' : '#991b1b',
                        color: '#fff'
                      }}>{r.status}</span>
                    </td>
                    <td>{r.consecutive_failures ?? 0}</td>
                    <td>{r.last_error_reason || '-'}</td>
                    <td>{r.last_attempt ? new Date(r.last_attempt).toLocaleString() : '-'}</td>
                    <td>
                      {r.status === 'Paused' && <button type="button" className="small" onClick={() => handleResume(r.service_id)} style={{ marginRight: '0.25rem' }}>Resume</button>}
                      {r.status === 'Active' && <button type="button" className="small" onClick={() => handlePause(r.service_id)} style={{ marginRight: '0.25rem' }}>Pause</button>}
                      <button type="button" className="small" onClick={() => setModalRow(r)}>History</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && !loading && <p className="muted">No services with webhooks in selected filters.</p>}
        </>
      )}
      <SlideModal isOpen={!!modalRow} onClose={() => setModalRow(null)} title="Webhook error history">
        {modalRow && (
          <div>
            <p><strong>Service:</strong> {modalRow.service_name}</p>
            <p><strong>Webhook URL:</strong> <code style={{ wordBreak: 'break-all' }}>{modalRow.webhook_url}</code></p>
            <p className="muted">Backend endpoint for error history not implemented yet. This modal shows service details.</p>
          </div>
        )}
      </SlideModal>
    </>
  );
}
