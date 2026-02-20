import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SearchFilter from '../components/SearchFilter';

export default function Wallets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mintOpen, setMintOpen] = useState(false);
  const [mintForm, setMintForm] = useState({ agent_id: '', coin: 'AGOTEST', amount_cents: '' });
  const [mintSubmitting, setMintSubmitting] = useState(false);
  const [mintMessage, setMintMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [agentFilter, setAgentFilter] = useState(searchParams.get('agent_id') || '');
  const [depositBaseUrl, setDepositBaseUrl] = useState(null);
  const limit = 50;

  useEffect(() => {
    api.config().then((r) => setDepositBaseUrl(r?.data?.deposit_base_url || null)).catch(() => setDepositBaseUrl(null));
  }, []);

  const load = () => {
    setLoadError('');
    setLoading(true);
    const q = { limit, offset: page * limit };
    if (searchQuery) q.q = searchQuery;
    if (agentFilter) q.agent_id = agentFilter;
    return api.wallets(q)
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

  useEffect(() => { load(); }, [page, searchQuery]);

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

  const handleSearch = (q) => {
    setPage(0);
    setSearchQuery(q);
    const params = new URLSearchParams();
    if (agentFilter) params.set('agent_id', agentFilter);
    if (q) params.set('q', q);
    setSearchParams(params);
  };

  const clearAgentFilter = () => {
    setPage(0);
    setAgentFilter('');
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    setSearchParams(params);
  };

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total) || 0;

  return (
    <>
      <PageHeader title="Balances" onReload={load} loading={loading} />
      <div className="card" style={{ marginBottom: '1rem' }}>
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
      <div className="card" style={{ marginBottom: '1rem' }}>
        {agentFilter && (
          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: '0.75rem' }}>Filtered by agent:</span>
            <code style={{ fontSize: '0.75rem' }}>{agentFilter}</code>
            <button type="button" onClick={clearAgentFilter} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Clear</button>
          </div>
        )}
        <label>Search</label>
        <SearchFilter
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search by agent ID or coin..."
        />
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w, i) => (
                <tr key={`${w.agent_id}-${w.coin}-${i}`}>
                  <td>
                    <Link to={`/agents/${w.agent_id}`} style={{ color: '#a78bfa' }}>
                      <code>{w.agent_id}</code>
                    </Link>
                  </td>
                  <td>{w.coin}</td>
                  <td>{w.balance_formated || Number(w.balance_cents).toLocaleString()}</td>
                  <td>
                    {(w.coin === 'AGO' || w.coin === 'AGOTEST') && depositBaseUrl && (
                      <a href={`${depositBaseUrl}/agent:${w.agent_id}`} target="_blank" rel="noopener noreferrer" className="secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', textDecoration: 'none', borderRadius: '4px' }}>
                        Deposit
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && <p className="muted">No balances found.</p>}
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
