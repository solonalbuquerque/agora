import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function AgentDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [wallets, setWallets] = useState([]);
  const [services, setServices] = useState({ rows: [], total: 0 });
  const [transactions, setTransactions] = useState({ rows: [], total: 0 });
  const [executions, setExecutions] = useState({ rows: [], total: 0 });
  const [trustLevels, setTrustLevels] = useState([]);

  const load = () => {
    setLoadError('');
    setLoading(true);
    return api.getAgent(id)
      .then((r) => {
        setAgent(r?.data || null);
      })
      .catch((err) => {
        if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
          navigate('/login', { replace: true });
          return;
        }
        if (err?.status === 404 || err?.code === 'NOT_FOUND') {
          setLoadError('Agent not found');
          return;
        }
        setLoadError(err?.message || 'Failed to load agent');
      })
      .finally(() => setLoading(false));
  };

  const loadRelated = () => {
    // Wallets
    api.wallets({ agent_id: id, limit: 100 })
      .then((r) => setWallets(r?.data?.rows || []))
      .catch(() => setWallets([]));
    
    // Services (owned by this agent)
    api.services({ owner_agent_id: id, limit: 5 })
      .then((r) => setServices({ rows: r?.data?.rows || [], total: r?.data?.total || 0 }))
      .catch(() => setServices({ rows: [], total: 0 }));
    
    // Transactions (ledger entries for this agent)
    api.ledger({ agent_id: id, limit: 5 })
      .then((r) => setTransactions({ rows: r?.data?.rows || [], total: r?.data?.total || 0 }))
      .catch(() => setTransactions({ rows: [], total: 0 }));
    
    // Executions (as requester)
    api.executions({ requester_agent_id: id, limit: 5 })
      .then((r) => setExecutions({ rows: r?.data?.rows || [], total: r?.data?.total || 0 }))
      .catch(() => setExecutions({ rows: [], total: 0 }));
  };

  useEffect(() => {
    load();
    loadRelated();
    api.trustLevels().then((r) => setTrustLevels(r?.data?.rows || [])).catch(() => setTrustLevels([]));
  }, [id]);

  const handleStatus = async (status) => {
    try {
      await api.updateAgentStatus(id, status);
      load();
    } catch (err) {
      alert(err?.message || 'Error');
    }
  };

  const handleTrustLevelChange = async (level) => {
    const value = parseInt(level, 10);
    if (Number.isNaN(value) || value === (agent?.trust_level ?? -1)) return;
    try {
      await api.updateAgent(id, { trust_level: value });
      load();
    } catch (err) {
      alert(err?.message || 'Error');
    }
  };

  // Calculate total balance across all wallets
  const totalBalance = wallets.reduce((acc, w) => acc + Number(w.balance_cents), 0);

  return (
    <>
      <PageHeader title="Agent Details" onReload={() => { load(); loadRelated(); }} loading={loading} />
      
      <p style={{ marginBottom: '1rem' }}>
        <Link to="/agents" style={{ color: '#a78bfa' }}>&larr; Back to Agents</Link>
      </p>

      {loadError && <p className="error" style={{ marginBottom: '1rem' }}>{loadError}</p>}
      
      {loading ? (
        <p className="muted">Loading…</p>
      ) : agent ? (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#a78bfa' }}>
                {wallets.length}
              </div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Wallets</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4ade80' }}>
                {totalBalance.toLocaleString()}
              </div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Total Balance (cents)</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#60a5fa' }}>
                {services.total}
              </div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Services</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f97316' }}>
                {transactions.total}
              </div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Transactions</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f472b6' }}>
                {executions.total}
              </div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Executions</div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Basic Info</h3>
            <table>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', width: '150px' }}>ID</td>
                  <td><code style={{ fontSize: '0.875rem' }}>{agent.id}</code></td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Name</td>
                  <td>{agent.name || '-'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Status</td>
                  <td>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      backgroundColor: agent.status === 'active' ? '#065f46' : agent.status === 'banned' ? '#991b1b' : '#92400e',
                      color: '#fff'
                    }}>
                      {agent.status}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Trust Level</td>
                  <td>
                    <select
                      value={agent.trust_level ?? 0}
                      onChange={(e) => handleTrustLevelChange(e.target.value)}
                      style={{ padding: '0.25rem 0.5rem', minWidth: '120px' }}
                    >
                      {trustLevels.length > 0
                        ? trustLevels.map((l) => (
                            <option key={l.level} value={l.level}>
                              {l.level} – {l.name}
                            </option>
                          ))
                        : [0, 1, 2, 3].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Created At</td>
                  <td>{agent.created_at ? new Date(agent.created_at).toLocaleString() : '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Actions</h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {agent.status !== 'active' && (
                <button type="button" className="primary" onClick={() => handleStatus('active')}>
                  Activate
                </button>
              )}
              {agent.status !== 'limited' && (
                <button type="button" onClick={() => handleStatus('limited')}>
                  Limit
                </button>
              )}
              {agent.status !== 'banned' && (
                <button type="button" className="danger" onClick={() => handleStatus('banned')}>
                  Ban
                </button>
              )}
            </div>
          </div>

          {/* Wallets */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#a78bfa' }}>Wallets</h3>
              <Link to={`/wallets?agent_id=${encodeURIComponent(id)}`} style={{ color: '#a78bfa', fontSize: '0.875rem' }}>
                View all &rarr;
              </Link>
            </div>
            {wallets.length === 0 ? (
              <p className="muted">No wallets for this agent.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Coin</th>
                    <th>Balance (cents)</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w) => (
                    <tr key={w.coin}>
                      <td>{w.coin}</td>
                      <td>{w.balance_formated || Number(w.balance_cents).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Services */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#a78bfa' }}>Services ({services.total})</h3>
              <Link to={`/services?owner_agent_id=${encodeURIComponent(id)}`} style={{ color: '#a78bfa', fontSize: '0.875rem' }}>
                View all &rarr;
              </Link>
            </div>
            {services.rows.length === 0 ? (
              <p className="muted">No services owned by this agent.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {services.rows.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/services/${s.id}`} style={{ color: '#a78bfa' }}>
                          <code>{s.id.slice(0, 12)}...</code>
                        </Link>
                      </td>
                      <td>{s.name}</td>
                      <td>{s.price_formated || `${(Number(s.price_cents) / 100).toFixed(2)} ${s.coin}`}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent Transactions */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#a78bfa' }}>Recent Transactions ({transactions.total})</h3>
              <Link to={`/ledger?agent_id=${encodeURIComponent(id)}`} style={{ color: '#a78bfa', fontSize: '0.875rem' }}>
                View all &rarr;
              </Link>
            </div>
            {transactions.rows.length === 0 ? (
              <p className="muted">No transactions for this agent.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Coin</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.rows.map((t) => (
                    <tr key={t.id}>
                      <td>{t.id}</td>
                      <td>
                        <span style={{
                          padding: '0.125rem 0.375rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          backgroundColor: t.type === 'credit' ? '#065f46' : t.type === 'debit' ? '#991b1b' : '#92400e',
                          color: '#fff'
                        }}>
                          {t.type}
                        </span>
                      </td>
                      <td>{t.coin}</td>
                      <td>{t.amount_formated || Number(t.amount_cents).toLocaleString()}</td>
                      <td>{t.created_at ? new Date(t.created_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent Executions */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#a78bfa' }}>Recent Executions ({executions.total})</h3>
              <Link to={`/executions?requester_agent_id=${encodeURIComponent(id)}`} style={{ color: '#a78bfa', fontSize: '0.875rem' }}>
                View all &rarr;
              </Link>
            </div>
            {executions.rows.length === 0 ? (
              <p className="muted">No executions by this agent.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.rows.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link to={`/executions/${e.id}`} style={{ color: '#a78bfa' }}>
                          {e.id}
                        </Link>
                      </td>
                      <td>
                        <Link to={`/services/${e.service_id}`} style={{ color: '#a78bfa' }}>
                          <code>{e.service_id.slice(0, 12)}...</code>
                        </Link>
                      </td>
                      <td>
                        <span style={{
                          padding: '0.125rem 0.375rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          backgroundColor: e.status === 'success' ? '#065f46' : e.status === 'failed' ? '#991b1b' : '#92400e',
                          color: '#fff'
                        }}>
                          {e.status}
                        </span>
                      </td>
                      <td>{e.latency_ms ?? '-'} ms</td>
                      <td>{e.created_at ? new Date(e.created_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
