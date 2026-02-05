import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function ServiceDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [executions, setExecutions] = useState([]);

  const load = () => {
    setLoadError('');
    setLoading(true);
    return api.getService(id)
      .then((r) => {
        setService(r?.data || null);
      })
      .catch((err) => {
        if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
          navigate('/login', { replace: true });
          return;
        }
        if (err?.status === 404 || err?.code === 'NOT_FOUND') {
          setLoadError('Service not found');
          return;
        }
        setLoadError(err?.message || 'Failed to load service');
      })
      .finally(() => setLoading(false));
  };

  const loadExecutions = () => {
    api.executions({ service_id: id, limit: 50 })
      .then((r) => setExecutions(r?.data?.rows || []))
      .catch(() => setExecutions([]));
  };

  useEffect(() => {
    load();
    loadExecutions();
  }, [id]);

  return (
    <>
      <PageHeader title="Service Details" onReload={load} loading={loading} />
      
      <p style={{ marginBottom: '1rem' }}>
        <Link to="/services" style={{ color: '#a78bfa' }}>&larr; Back to Services</Link>
      </p>

      {loadError && <p className="error" style={{ marginBottom: '1rem' }}>{loadError}</p>}
      
      {loading ? (
        <p className="muted">Loading…</p>
      ) : service ? (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Basic Info</h3>
            <table>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', width: '150px' }}>ID</td>
                  <td><code style={{ fontSize: '0.875rem' }}>{service.id}</code></td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Name</td>
                  <td>{service.name}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Description</td>
                  <td>{service.description || '-'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Owner Agent</td>
                  <td>
                    <Link to={`/agents/${service.owner_agent_id}`} style={{ color: '#a78bfa' }}>
                      <code>{service.owner_agent_id}</code>
                    </Link>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Price</td>
                  <td>{(Number(service.price_cents) / 100).toFixed(2)} {service.coin}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Webhook URL</td>
                  <td style={{ wordBreak: 'break-all' }}>{service.webhook_url || '-'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Status</td>
                  <td>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      backgroundColor: service.status === 'active' ? '#065f46' : service.status === 'removed' ? '#991b1b' : '#92400e',
                      color: '#fff'
                    }}>
                      {service.status}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Created At</td>
                  <td>{service.created_at ? new Date(service.created_at).toLocaleString() : '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {service.input_schema && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Input Schema</h3>
              <pre style={{ background: '#27272a', padding: '1rem', borderRadius: '4px', overflow: 'auto', fontSize: '0.75rem' }}>
                {JSON.stringify(service.input_schema, null, 2)}
              </pre>
            </div>
          )}

          {service.output_schema && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Output Schema</h3>
              <pre style={{ background: '#27272a', padding: '1rem', borderRadius: '4px', overflow: 'auto', fontSize: '0.75rem' }}>
                {JSON.stringify(service.output_schema, null, 2)}
              </pre>
            </div>
          )}

          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#a78bfa' }}>Recent Executions</h3>
            {executions.length === 0 ? (
              <p className="muted">No executions for this service.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Requester</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link to={`/executions/${e.id}`} style={{ color: '#a78bfa' }}>
                          {e.id}
                        </Link>
                      </td>
                      <td>
                        <Link to={`/agents/${e.requester_agent_id}`} style={{ color: '#a78bfa' }}>
                          <code>{e.requester_agent_id.slice(0, 8)}...</code>
                        </Link>
                      </td>
                      <td>{e.status}</td>
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
