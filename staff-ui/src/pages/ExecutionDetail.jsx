import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function ExecutionDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [execution, setExecution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = () => {
    setLoadError('');
    setLoading(true);
    return api.getExecution(id)
      .then((r) => {
        setExecution(r?.data || null);
      })
      .catch((err) => {
        if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
          navigate('/login', { replace: true });
          return;
        }
        if (err?.status === 404 || err?.code === 'NOT_FOUND') {
          setLoadError('Execution not found');
          return;
        }
        setLoadError(err?.message || 'Failed to load execution');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  return (
    <>
      <PageHeader title="Execution Details" onReload={load} loading={loading} />
      
      <p style={{ marginBottom: '1rem' }}>
        <Link to="/executions" style={{ color: '#a78bfa' }}>&larr; Back to Executions</Link>
      </p>

      {loadError && <p className="error" style={{ marginBottom: '1rem' }}>{loadError}</p>}
      
      {loading ? (
        <p className="muted">Loading…</p>
      ) : execution ? (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Basic Info</h3>
            <table>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', width: '150px' }}>ID</td>
                  <td>{execution.id}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>UUID</td>
                  <td><code style={{ fontSize: '0.875rem' }}>{execution.uuid}</code></td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Service</td>
                  <td>
                    <Link to={`/services/${execution.service_id}`} style={{ color: '#a78bfa' }}>
                      <code>{execution.service_id}</code>
                    </Link>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Requester Agent</td>
                  <td>
                    <Link to={`/agents/${execution.requester_agent_id}`} style={{ color: '#a78bfa' }}>
                      <code>{execution.requester_agent_id}</code>
                    </Link>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Status</td>
                  <td>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      backgroundColor: execution.status === 'success' ? '#065f46' : execution.status === 'failed' ? '#991b1b' : '#92400e',
                      color: '#fff'
                    }}>
                      {execution.status}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Price Charged</td>
                  <td>{execution.price_charged_cents ? `${(Number(execution.price_charged_cents) / 100).toFixed(2)} ${execution.coin || ''}` : '-'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Latency</td>
                  <td>{execution.latency_ms ?? '-'} ms</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Created At</td>
                  <td>{execution.created_at ? new Date(execution.created_at).toLocaleString() : '-'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Completed At</td>
                  <td>{execution.completed_at ? new Date(execution.completed_at).toLocaleString() : '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {execution.request && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Request</h3>
              <pre style={{ background: '#27272a', padding: '1rem', borderRadius: '4px', overflow: 'auto', fontSize: '0.75rem' }}>
                {JSON.stringify(execution.request, null, 2)}
              </pre>
            </div>
          )}

          {execution.response && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Response</h3>
              <pre style={{ background: '#27272a', padding: '1rem', borderRadius: '4px', overflow: 'auto', fontSize: '0.75rem' }}>
                {JSON.stringify(execution.response, null, 2)}
              </pre>
            </div>
          )}

          {execution.error && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#f87171' }}>Error</h3>
              <pre style={{ background: '#27272a', padding: '1rem', borderRadius: '4px', overflow: 'auto', fontSize: '0.75rem', color: '#f87171' }}>
                {typeof execution.error === 'string' ? execution.error : JSON.stringify(execution.error, null, 2)}
              </pre>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
