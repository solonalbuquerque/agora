import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SlideModal from '../components/SlideModal';
import { money } from '../utils/money';

export default function Coins() {
  const navigate = useNavigate();
  const [coins, setCoins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceMsg, setRebalanceMsg] = useState(null);
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [editingCoin, setEditingCoin] = useState(null);
  const [form, setForm] = useState({ coin: '', name: '', qtd_cents: '', prefix: '', suffix: '', decimals: '2' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => {
    setLoadError('');
    setLoading(true);
    return api.coins()
      .then((r) => {
        const rows = Array.isArray(r?.data?.rows) ? r.data.rows : [];
        setCoins(rows);
      })
      .catch((err) => {
        if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
          navigate('/login', { replace: true });
          return;
        }
        setCoins([]);
        setLoadError(err?.message || 'Failed to load coins');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setModalMode('create');
    setEditingCoin(null);
    setForm({ coin: '', name: '', qtd_cents: '', prefix: '', suffix: '', decimals: '2' });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (coin) => {
    setModalMode('edit');
    setEditingCoin(coin.coin);
    setForm({ 
      coin: coin.coin, 
      name: coin.name || '', 
      qtd_cents: String(coin.qtd_cents || 0),
      prefix: coin.prefix || '',
      suffix: coin.suffix || '',
      decimals: String(coin.decimals ?? 2)
    });
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingCoin(null);
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    
    if (modalMode === 'create' && !form.coin.trim()) {
      setFormError('Coin symbol is required');
      return;
    }
    
    setSubmitting(true);
    try {
      const data = {
        name: form.name.trim() || (modalMode === 'create' ? form.coin.trim().toUpperCase() : undefined),
        qtd_cents: parseInt(form.qtd_cents, 10) || 0,
        prefix: form.prefix,
        suffix: form.suffix,
        decimals: parseInt(form.decimals, 10) || 2,
      };
      if (modalMode === 'create') {
        data.coin = form.coin.trim().toUpperCase();
        await api.createCoin(data);
      } else {
        await api.updateCoin(editingCoin, data);
      }
      closeModal();
      load();
    } catch (err) {
      setFormError(err?.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (coin) => {
    if (!confirm(`Delete coin "${coin}"? This cannot be undone.`)) return;
    try {
      await api.deleteCoin(coin);
      load();
    } catch (err) {
      alert(err?.message || 'Failed to delete coin');
    }
  };

  const handleRebalance = async () => {
    setRebalancing(true);
    setRebalanceMsg(null);
    try {
      const r = await api.rebalanceCoins();
      const updated = r?.data?.updated || [];
      setRebalanceMsg({ type: 'success', text: `Rebalanced ${updated.length} coin(s) successfully.` });
      load();
    } catch (err) {
      setRebalanceMsg({ type: 'error', text: err?.message || 'Rebalance failed' });
    } finally {
      setRebalancing(false);
    }
  };

  // Format amount with coin display settings
  const formatAmount = (cents, coin) => money(cents, coin);

  return (
    <>
      <PageHeader title="Coins" onReload={load} loading={loading} />
      
      <div className="card" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="primary" onClick={openCreate}>New Coin</button>
        <button type="button" onClick={handleRebalance} disabled={rebalancing}>
          {rebalancing ? 'Rebalancing…' : 'Rebalance All'}
        </button>
        {rebalanceMsg && (
          <span className={rebalanceMsg.type === 'success' ? 'success' : 'error'} style={{ marginLeft: '0.5rem' }}>
            {rebalanceMsg.text}
          </span>
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
                <th>Symbol</th>
                <th>Name</th>
                <th>Display Format</th>
                <th>Circulating</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((c) => (
                <tr key={c.coin}>
                  <td><code>{c.coin}</code></td>
                  <td>{c.name}</td>
                  <td>
                    <code style={{ fontSize: '0.8rem', background: '#27272a', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                      {c.prefix || ''}123{c.suffix ? ' ' + c.suffix : ''} ({c.decimals ?? 2} dec)
                    </code>
                  </td>
                  <td>{c.circulating_formated || formatAmount(c.circulating_cents || 0, c)}</td>
                  <td>
                    <button type="button" className="small" onClick={() => openEdit(c)} style={{ marginRight: '0.25rem' }}>Edit</button>
                    <button type="button" className="small danger" onClick={() => handleDelete(c.coin)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {coins.length === 0 && !loading && <p className="muted">No coins yet. Create one above.</p>}
        </>
      )}

      <SlideModal 
        isOpen={modalOpen} 
        onClose={closeModal} 
        title={modalMode === 'create' ? 'New Coin' : `Edit ${editingCoin}`}
      >
        <form onSubmit={handleSubmit}>
          {modalMode === 'create' && (
            <div className="form-row">
              <label>Symbol (e.g. AGOTEST)</label>
              <input 
                value={form.coin} 
                onChange={(e) => setForm((f) => ({ ...f, coin: e.target.value.toUpperCase() }))} 
                placeholder="SYMBOL" 
                maxLength={16}
                disabled={submitting}
              />
            </div>
          )}
          <div className="form-row">
            <label>Name</label>
            <input 
              value={form.name} 
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} 
              placeholder="Coin name"
              disabled={submitting}
            />
          </div>
          
          <h4 style={{ margin: '1.5rem 0 0.75rem', fontSize: '0.9rem', color: '#a1a1aa' }}>Display Settings</h4>
          
          <div className="form-row">
            <label>Prefix (e.g. $, R$)</label>
            <input 
              value={form.prefix} 
              onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))} 
              placeholder="$"
              maxLength={10}
              disabled={submitting}
              style={{ maxWidth: '8rem' }}
            />
          </div>
          <div className="form-row">
            <label>Suffix (e.g. USD, BRL)</label>
            <input 
              value={form.suffix} 
              onChange={(e) => setForm((f) => ({ ...f, suffix: e.target.value }))} 
              placeholder="USD"
              maxLength={10}
              disabled={submitting}
              style={{ maxWidth: '8rem' }}
            />
          </div>
          <div className="form-row">
            <label>Decimal Places</label>
            <input 
              type="number" 
              min={0}
              max={8}
              value={form.decimals} 
              onChange={(e) => setForm((f) => ({ ...f, decimals: e.target.value }))} 
              placeholder="2"
              disabled={submitting}
              style={{ maxWidth: '6rem' }}
            />
          </div>
          
          <div className="form-row" style={{ marginTop: '1rem', padding: '0.75rem', background: '#27272a', borderRadius: '6px' }}>
            <label style={{ marginBottom: '0.5rem' }}>Preview</label>
            <span style={{ fontSize: '1.1rem' }}>
              {form.prefix || ''}1234.{'5'.repeat(parseInt(form.decimals, 10) || 2)}{form.suffix ? ' ' + form.suffix : ''}
            </span>
          </div>

          {formError && <p className="error" style={{ marginBottom: '1rem' }}>{formError}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Saving…' : (modalMode === 'create' ? 'Create' : 'Save')}
            </button>
            <button type="button" onClick={closeModal} disabled={submitting}>Cancel</button>
          </div>
        </form>
      </SlideModal>
    </>
  );
}
