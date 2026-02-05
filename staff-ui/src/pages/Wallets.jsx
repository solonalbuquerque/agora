import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function Wallets() {
  const navigate = useNavigate();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mintOpen, setMintOpen] = useState(false);
  const [mintForm, setMintForm] = useState({ agent_id: '', coin: 'AGOTEST', amount_cents: '' });
  const [mintSubmitting, setMintSubmitting] = useState(false);
  const [mintMessage, setMintMessage] = useState(null); // { type: 'success'|'error', text }
  const limit = 50;

  const load = () => {
    setLoadError('');
    setLoading(true);
    return api.wallets({ limit, offset: page * limit })
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
        setLoadError(err?.message || 'Failed to load balances');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  const handleMint = async (e) => {
    e.preventDefault();
    setMintMessage(null);
    const amount = parseInt(mintForm.amount_cents, 10);
    if (!mintForm.agent_id?.trim() || !amount || amount < 1) {
      setMintMessage({ type: 'error', text: 'Enter agent ID and a positive amount (cents).' });
      return;
    }
    setMintSubmitting(true);
    try {
      await api.mint({ agent_id: mintForm.agent_id.trim(), coin: mintForm.coin, amount_cents: amount });
      setMintMessage({ type: 'success', text: `Mint successful: ${amount} cents to ${mintForm.coin} for agent ${mintForm.agent_id}.` });
      setMintOpen(false);
      setMintForm({ agent_id: '', coin: 'AGOTEST', amount_cents: '' });
      load();
    } catch (err) {
      setMintMessage({ type: 'error', text: err?.message || 'Mint failed.' });
    } finally {
      setMintSubmitting(false);
    }
  };

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Balances" onReload={load} loading={loading} />
      <div className="card">
        {!mintOpen ? (
          <button type="button" className="primary" onClick={() => { setMintOpen(true); setMintMessage(null); }}>Mint (credit)</button>
        ) : (
          <form onSubmit={handleMint}>
            <div className="form-row">
              <label>Agent ID</label>
              <input value={mintForm.agent_id} onChange={(e) => setMintForm((f) => ({ ...f, agent_id: e.target.value }))} placeholder="Agent UUID" />
            </div>
            <div className="form-row">
              <label>Coin</label>
              <input value={mintForm.coin} onChange={(e) => setMintForm((f) => ({ ...f, coin: e.target.value }))} placeholder="AGOTEST" />
            </div>
            <div className="form-row">
              <label>Amount (cents)</label>
              <input type="number" min={1} value={mintForm.amount_cents} onChange={(e) => setMintForm((f) => ({ ...f, amount_cents: e.target.value }))} placeholder="100" />
            </div>
            <button type="submit" className="primary" disabled={mintSubmitting}>{mintSubmitting ? 'Minting…' : 'Mint'}</button>
            <button type="button" onClick={() => { setMintOpen(false); setMintMessage(null); }} style={{ marginLeft: '0.5rem' }} disabled={mintSubmitting}>Cancel</button>
          </form>
        )}
        {mintMessage && (
          <p style={{ marginTop: '0.75rem', padding: '0.5rem', borderRadius: 4, fontSize: '0.875rem', backgroundColor: mintMessage.type === 'success' ? '#d1fae5' : '#fee2e2', color: mintMessage.type === 'success' ? '#065f46' : '#991b1b' }}>
            {mintMessage.text}
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
                <th>Agent ID</th>
                <th>Coin</th>
                <th>Balance (cents)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w, i) => (
                <tr key={`${w.agent_id}-${w.coin}-${i}`}>
                  <td><code>{w.agent_id}</code></td>
                  <td>{w.coin}</td>
                  <td>{Number(w.balance_cents).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No balances recorded yet. Use Mint to credit an agent.</p>}
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
