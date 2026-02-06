import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SlideModal from '../components/SlideModal';
import { auditLog as mockData } from '../data/mockSecurity';

export default function AuditLog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [eventFilter, setEventFilter] = useState(searchParams.get('event_type') || '');
  const [actorFilter, setActorFilter] = useState(searchParams.get('actor_type') || '');
  const [targetFilter, setTargetFilter] = useState(searchParams.get('target_type') || '');
  const [fromDate, setFromDate] = useState(searchParams.get('from_date') || '');
  const [toDate, setToDate] = useState(searchParams.get('to_date') || '');
  const [selectedRow, setSelectedRow] = useState(null);
  const limit = 50;

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (eventFilter) q.event_type = eventFilter;
    if (actorFilter) q.actor_type = actorFilter;
    if (targetFilter) q.target_type = targetFilter;
    if (fromDate) q.from_date = fromDate;
    if (toDate) q.to_date = toDate;
    api.audit(q)
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
    if (eventFilter) params.set('event_type', eventFilter);
    if (actorFilter) params.set('actor_type', actorFilter);
    if (targetFilter) params.set('target_type', targetFilter);
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    setSearchParams(params);
  }, [eventFilter, actorFilter, targetFilter, fromDate, toDate]);

  useEffect(() => { load(); }, [page, eventFilter, actorFilter, targetFilter, fromDate, toDate]);

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || rows.length;

  const eventTypes = [...new Set(rows.map((r) => r.event_type).filter(Boolean))];
  const actorTypes = [...new Set(rows.map((r) => r.actor_type).filter(Boolean))];
  const targetTypes = [...new Set(rows.map((r) => r.target_type).filter(Boolean))];

  return (
    <>
      <PageHeader title="Audit Log" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Event type</label>
            <select value={eventFilter} onChange={(e) => { setPage(0); setEventFilter(e.target.value); }} style={{ maxWidth: '14rem' }}>
              <option value="">All</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              {eventTypes.length === 0 && (
                <>
                  <option value="STAFF_MINT">STAFF_MINT</option>
                  <option value="AGENT_BAN">AGENT_BAN</option>
                  <option value="ISSUER_CREDIT">ISSUER_CREDIT</option>
                  <option value="HUMAN_BAN">HUMAN_BAN</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label>Actor type</label>
            <select value={actorFilter} onChange={(e) => { setPage(0); setActorFilter(e.target.value); }} style={{ maxWidth: '10rem' }}>
              <option value="">All</option>
              <option value="admin">Admin</option>
              <option value="human">Human</option>
              <option value="issuer">Issuer</option>
              <option value="system">System</option>
            </select>
          </div>
          <div>
            <label>Target type</label>
            <select value={targetFilter} onChange={(e) => { setPage(0); setTargetFilter(e.target.value); }} style={{ maxWidth: '10rem' }}>
              <option value="">All</option>
              <option value="agent">Agent</option>
              <option value="wallet">Wallet</option>
              <option value="human">Human</option>
              <option value="issuer">Issuer</option>
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
                  <th>Event type</th>
                  <th>Actor type</th>
                  <th>Actor ID</th>
                  <th>Target type</th>
                  <th>Target ID</th>
                  <th>Request ID</th>
                  <th>Created at</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.event_type}</code></td>
                    <td>{r.actor_type}</td>
                    <td>{r.actor_id ? <Link to={r.actor_type === 'issuer' ? '#' : `/agents/${r.actor_id}`} style={{ color: '#a78bfa' }}><code>{r.actor_id?.slice(0, 8)}...</code></Link> : '-'}</td>
                    <td>{r.target_type}</td>
                    <td>{r.target_id ? <Link to={`/agents/${r.target_id}`} style={{ color: '#a78bfa' }}><code>{r.target_id?.slice(0, 8)}...</code></Link> : r.target_id || '-'}</td>
                    <td><code>{r.request_id || '-'}</code></td>
                    <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                    <td>
                      <button type="button" className="small" onClick={() => setSelectedRow(r)}>Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && !loading && <p className="muted">No audit events in selected period.</p>}
          {total > limit && (
            <p style={{ marginTop: '1rem' }}>
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span style={{ margin: '0 1rem' }}>{page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}</span>
              <button type="button" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </p>
          )}
        </>
      )}
      <SlideModal isOpen={!!selectedRow} onClose={() => setSelectedRow(null)} title="Audit event metadata">
        {selectedRow && (
          <div>
            <p><strong>Event:</strong> {selectedRow.event_type}</p>
            <p><strong>Actor:</strong> {selectedRow.actor_type} {selectedRow.actor_id || ''}</p>
            <p><strong>Target:</strong> {selectedRow.target_type} {selectedRow.target_id || ''}</p>
            <p><strong>Request ID:</strong> {selectedRow.request_id || '-'}</p>
            <p><strong>Created:</strong> {selectedRow.created_at ? new Date(selectedRow.created_at).toLocaleString() : '-'}</p>
            <p><strong>Metadata:</strong></p>
            <pre style={{ background: '#27272a', padding: '1rem', borderRadius: '6px', overflow: 'auto', fontSize: '0.8rem' }}>
              {JSON.stringify(selectedRow.metadata || {}, null, 2)}
            </pre>
          </div>
        )}
      </SlideModal>
    </>
  );
}
