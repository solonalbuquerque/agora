import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function LedgerDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = () => {
    setLoadError('');
    setLoading(true);
    return api.getLedgerEntry(id)
      .then((r) => {
        setEntry(r?.data || null);
      })
      .catch((err) => {
        if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
          navigate('/login', { replace: true });
          return;
        }
        if (err?.status === 404 || err?.code === 'NOT_FOUND') {
          setLoadError('Transaction not found');
          return;
        }
        setLoadError(err?.message || 'Failed to load transaction');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const meta = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : null;
  const linkedAgentId = meta?.to_agent_id || meta?.from_agent_id || null;
  const executionUuid = meta?.execution_uuid || null;
  const externalRef = entry?.external_ref || null;

  return (
    <>
      <PageHeader title="Transaction Details" onReload={load} loading={loading} />

      <p style={{ marginBottom: '1rem' }}>
        <Link to="/ledger" style={{ color: '#a78bfa' }}>&larr; Back to Ledger</Link>
      </p>

      {loadError && <p className="error" style={{ marginBottom: '1rem' }}>{loadError}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : entry ? (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Basic Info</h3>
            <table>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', width: '160px' }}>ID</td>
                  <td>{entry.id}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>UUID</td>
                  <td><code style={{ fontSize: '0.875rem' }}>{entry.uuid}</code></td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Agent</td>
                  <td>
                    <Link to={`/agents/${entry.agent_id}`} style={{ color: '#a78bfa' }}>
                      <code>{entry.agent_id}</code>
                    </Link>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Type</td>
                  <td>{entry.type}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Coin</td>
                  <td>{entry.coin}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Amount</td>
                  <td>{entry.amount_formated || entry.amount_cents}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>External Ref</td>
                  <td>{externalRef || '-'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Created At</td>
                  <td>{entry.created_at ? new Date(entry.created_at).toLocaleString() : '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Links</h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link to={`/agents/${entry.agent_id}`} style={{ color: '#a78bfa' }}>
                Go to Agent
              </Link>
              {linkedAgentId && (
                <Link to={`/agents/${linkedAgentId}`} style={{ color: '#a78bfa' }}>
                  Related Agent
                </Link>
              )}
              {externalRef && (
                <Link to={`/ledger?q=${encodeURIComponent(externalRef)}`} style={{ color: '#a78bfa' }}>
                  View Linked Transactions
                </Link>
              )}
              {executionUuid && (
                <Link to={`/executions?q=${encodeURIComponent(executionUuid)}`} style={{ color: '#a78bfa' }}>
                  View Execution
                </Link>
              )}
            </div>
          </div>

          {meta && (
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Metadata</h3>
              <pre style={{ background: '#27272a', padding: '1rem', borderRadius: '4px', overflow: 'auto', fontSize: '0.75rem' }}>
                {JSON.stringify(meta, null, 2)}
              </pre>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
