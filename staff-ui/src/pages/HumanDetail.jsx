import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function HumanDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [human, setHuman] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [linkingAgent, setLinkingAgent] = useState(false);
  const [allAgents, setAllAgents] = useState([]);
  const [linkAgentId, setLinkAgentId] = useState('');
  const [linkRole, setLinkRole] = useState('owner');

  const load = () => {
    setLoadError('');
    setLoading(true);
    return api.getHuman(id)
      .then((r) => {
        setHuman(r?.data || null);
      })
      .catch((err) => {
        if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
          navigate('/login', { replace: true });
          return;
        }
        if (err?.status === 404 || err?.code === 'NOT_FOUND') {
          setLoadError('Human not found');
          return;
        }
        setLoadError(err?.message || 'Failed to load human');
      })
      .finally(() => setLoading(false));
  };

  const loadAgents = () => {
    setLoadingAgents(true);
    api.getHumanAgents(id)
      .then((r) => {
        setAgents(r?.data?.rows || []);
      })
      .catch(() => {
        setAgents([]);
      })
      .finally(() => setLoadingAgents(false));
  };

  useEffect(() => {
    load();
    loadAgents();
  }, [id]);

  useEffect(() => {
    if (linkingAgent) {
      api.agents({ limit: 200 }).then((r) => setAllAgents(r?.data?.rows || [])).catch(() => setAllAgents([]));
    }
  }, [linkingAgent]);

  const handleLinkAgent = async (e) => {
    e.preventDefault();
    if (!linkAgentId) return;
    try {
      await api.linkHumanAgent(id, linkAgentId, linkRole);
      setLinkAgentId('');
      setLinkingAgent(false);
      loadAgents();
    } catch (err) {
      alert(err?.message || 'Error linking agent');
    }
  };

  const handleUnlinkAgent = async (agentId) => {
    if (!confirm('Unlink this agent?')) return;
    try {
      await api.unlinkHumanAgent(id, agentId);
      loadAgents();
    } catch (err) {
      alert(err?.message || 'Error unlinking');
    }
  };

  const handleStatus = async (status) => {
    try {
      await api.updateHumanStatus(id, status);
      load();
    } catch (err) {
      alert(err?.message || 'Error');
    }
  };

  return (
    <>
      <PageHeader title="Human Details" onReload={load} loading={loading} />
      
      <p style={{ marginBottom: '1rem' }}>
        <Link to="/humans" style={{ color: '#a78bfa' }}>&larr; Back to Humans</Link>
      </p>

      {loadError && <p className="error" style={{ marginBottom: '1rem' }}>{loadError}</p>}
      
      {loading ? (
        <p className="muted">Loading…</p>
      ) : human ? (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Basic Info</h3>
            <table>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', width: '150px' }}>ID</td>
                  <td><code style={{ fontSize: '0.875rem' }}>{human.id}</code></td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Email</td>
                  <td>{human.email}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Status</td>
                  <td>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      backgroundColor: human.status === 'verified' ? '#065f46' : human.status === 'banned' ? '#991b1b' : '#92400e',
                      color: '#fff'
                    }}>
                      {human.status}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Created At</td>
                  <td>{human.created_at ? new Date(human.created_at).toLocaleString() : '-'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Verified At</td>
                  <td>{human.verified_at ? new Date(human.verified_at).toLocaleString() : '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Actions</h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {human.status !== 'verified' && (
                <button type="button" className="primary" onClick={() => handleStatus('verified')}>
                  Verify
                </button>
              )}
              {human.status !== 'pending' && (
                <button type="button" onClick={() => handleStatus('pending')}>
                  Set Pending
                </button>
              )}
              {human.status !== 'banned' && (
                <button type="button" className="danger" onClick={() => handleStatus('banned')}>
                  Ban
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, color: '#a78bfa' }}>Linked agents</h3>
              {!linkingAgent ? (
                <button type="button" className="primary" onClick={() => setLinkingAgent(true)}>Link agent</button>
              ) : (
                <form onSubmit={handleLinkAgent} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={linkAgentId}
                    onChange={(e) => setLinkAgentId(e.target.value)}
                    required
                    style={{ minWidth: '200px' }}
                  >
                    <option value="">Select agent</option>
                    {allAgents.filter((a) => !agents.some((la) => la.agent_id === a.id)).map((a) => (
                      <option key={a.id} value={a.id}>{a.name || a.id}</option>
                    ))}
                  </select>
                  <select value={linkRole} onChange={(e) => setLinkRole(e.target.value)}>
                    <option value="owner">owner</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <button type="submit" className="primary">Link</button>
                  <button type="button" onClick={() => { setLinkingAgent(false); setLinkAgentId(''); }}>Cancel</button>
                </form>
              )}
            </div>
            {loadingAgents ? (
              <p className="muted">Loading agents…</p>
            ) : agents.length === 0 ? (
              <p className="muted">No agents linked to this human.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Agent ID</th>
                    <th>Role</th>
                    <th>Linked at</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.agent_id}>
                      <td>
                        <Link to={`/agents/${a.agent_id}`} style={{ color: '#a78bfa' }}>
                          <code>{a.agent_id}</code>
                        </Link>
                      </td>
                      <td>{a.role}</td>
                      <td>{a.created_at ? new Date(a.created_at).toLocaleString() : '-'}</td>
                      <td>
                        <button type="button" onClick={() => handleUnlinkAgent(a.agent_id)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>Unlink</button>
                      </td>
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
