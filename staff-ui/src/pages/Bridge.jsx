import { useState, useEffect } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SlideModal from '../components/SlideModal';

export default function Bridge() {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ status: '', kind: '', coin: '' });
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const limit = 20;

  const load = () => {
    setError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (filters.status) q.status = filters.status;
    if (filters.kind) q.kind = filters.kind;
    if (filters.coin) q.coin = filters.coin;
    api.bridge(q)
      .then((r) => {
        setData({ rows: r?.data?.rows ?? [], total: r?.data?.total ?? 0 });
      })
      .catch((e) => {
        setData({ rows: [], total: 0 });
        setError(e?.message || 'Failed to load bridge transfers');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, filters.status, filters.kind, filters.coin]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    api.getBridge(detailId).then((r) => setDetail(r?.data ?? null)).catch(() => setDetail(null));
  }, [detailId]);

  const handleSettle = async (id) => {
    setActionLoading(true);
    try {
      await api.bridgeSettle(id);
      setDetailId(null);
      load();
    } catch (e) {
      setError(e?.message || 'Settle failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id) => {
    setActionLoading(true);
    try {
      await api.bridgeReject(id, rejectReason);
      setDetailId(null);
      setRejectReason('');
      load();
    } catch (e) {
      setError(e?.message || 'Reject failed');
    } finally {
      setActionLoading(false);
    }
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <>
      <PageHeader title="Bridge Transfers" onReload={load} loading={loading} />
      {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, status: e.target.value })); }}
              style={{ minWidth: '8rem' }}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="settled">Settled</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label>Kind</label>
            <select
              value={filters.kind}
              onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, kind: e.target.value })); }}
              style={{ minWidth: '8rem' }}
            >
              <option value="">All</option>
              <option value="cross_instance">Cross-instance</option>
              <option value="cashout">Cashout</option>
            </select>
          </div>
          <div>
            <label>Coin</label>
            <input
              type="text"
              value={filters.coin}
              onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, coin: e.target.value })); }}
              placeholder="e.g. AGO"
              style={{ width: '6rem' }}
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
                <th>Transfer ID</th>
                <th>Kind</th>
                <th>From agent</th>
                <th>Coin</th>
                <th>Amount</th>
                <th>To / Destination</th>
                <th>Status</th>
                <th>Created</th>
                <th>External ref</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td><code title={t.id}>{String(t.id).slice(0, 8)}…</code></td>
                  <td>{t.kind === 'cashout' ? 'Cashout' : 'Cross-instance'}</td>
                  <td><code title={t.from_agent_id}>{String(t.from_agent_id).slice(0, 12)}…</code></td>
                  <td>{t.coin}</td>
                  <td>{Number(t.amount_cents).toLocaleString()}</td>
                  <td>
                    {t.kind === 'cashout' ? (t.destination_ref || '—') : `${t.to_instance_id || '—'} / ${t.to_agent_id || '—'}`}
                  </td>
                  <td>
                    <span className={t.status === 'settled' ? 'success' : t.status === 'rejected' ? 'error' : ''}>
                      {t.status}
                    </span>
                  </td>
                  <td>{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                  <td><code style={{ fontSize: '0.75rem' }}>{t.external_ref || '—'}</code></td>
                  <td>
                    <button type="button" className="secondary" style={{ marginRight: '0.25rem' }} onClick={() => setDetailId(t.id)}>Details</button>
                    {t.status === 'pending' && (
                      <>
                        <button type="button" className="primary" style={{ marginRight: '0.25rem' }} onClick={() => handleSettle(t.id)} disabled={actionLoading}>Settle</button>
                        <button type="button" className="secondary" onClick={() => { setDetailId(t.id); setRejectReason(''); }}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="muted">No bridge transfers.</p>}
          {total > limit && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="muted">Page {page + 1} ({(page * limit) + 1}–{Math.min((page + 1) * limit, total)} of {total})</span>
              <button type="button" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
      <SlideModal open={!!detailId} onClose={() => { setDetailId(null); setRejectReason(''); }} title="Bridge transfer">
        {detail && (
          <div>
            <table>
              <tbody>
                <tr><td>ID</td><td><code>{detail.id}</code></td></tr>
                <tr><td>Kind</td><td>{detail.kind}</td></tr>
                <tr><td>From agent</td><td><code>{detail.from_agent_id}</code></td></tr>
                <tr><td>Coin</td><td>{detail.coin}</td></tr>
                <tr><td>Amount (cents)</td><td>{detail.amount_cents}</td></tr>
                <tr><td>To instance</td><td>{detail.to_instance_id || '—'}</td></tr>
                <tr><td>To agent</td><td>{detail.to_agent_id || '—'}</td></tr>
                <tr><td>Destination ref</td><td>{detail.destination_ref || '—'}</td></tr>
                <tr><td>Status</td><td>{detail.status}</td></tr>
                <tr><td>Reject reason</td><td>{detail.reject_reason || '—'}</td></tr>
                <tr><td>External ref</td><td><code>{detail.external_ref || '—'}</code></td></tr>
                <tr><td>Created</td><td>{detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}</td></tr>
              </tbody>
            </table>
            {detail.status === 'pending' && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <label>Reject reason (optional)</label>
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection"
                    style={{ width: '100%', marginTop: '0.25rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="primary" onClick={() => handleSettle(detail.id)} disabled={actionLoading}>Settle</button>
                  <button type="button" className="secondary" onClick={() => handleReject(detail.id)} disabled={actionLoading}>Reject</button>
                </div>
              </div>
            )}
          </div>
        )}
      </SlideModal>
    </>
  );
}
