import { useState, useEffect } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function Config() {
  const [config, setConfig] = useState(null);
  const [issuers, setIssuers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 2FA states
  const [setting2fa, setSetting2fa] = useState(false);
  const [twoFaData, setTwoFaData] = useState(null); // { qrUrl, secret }
  const [twoFaError, setTwoFaError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.config().then((r) => setConfig(r?.data ?? {})).catch(() => setConfig({})),
      api.issuers().then((r) => setIssuers(Array.isArray(r?.data?.rows) ? r.data.rows : [])).catch(() => setIssuers([])),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSetup2fa = async () => {
    setSetting2fa(true);
    setTwoFaError('');
    setTwoFaData(null);
    try {
      const r = await api.setup2fa();
      if (r?.qrUrl) {
        setTwoFaData({ qrUrl: r.qrUrl, secret: r.secret });
      } else {
        setTwoFaError(r?.message || '2FA setup failed');
      }
    } catch (err) {
      setTwoFaError(err?.message || '2FA setup failed');
    } finally {
      setSetting2fa(false);
      load();
    }
  };

  if (!config) return <div className="page-title">Loading…</div>;

  return (
    <>
      <PageHeader title="Settings" onReload={load} loading={loading} />
      
      <div className="card">
        <h3 style={{ marginTop: 0 }}>System</h3>
        <p><strong>Default coin:</strong> {config.defaultCoin}</p>
        <p><strong>Faucet enabled:</strong> {config.enableFaucet ? 'Yes' : 'No'}</p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Two-Factor Authentication (2FA)</h3>
        <div style={{ marginBottom: '1rem' }}>
          <p><strong>2FA enabled:</strong> {config.staff2faEnabled ? <span className="success">Yes</span> : 'No'}</p>
          <p><strong>2FA required:</strong> {config.staff2faForced ? <span className="success">Yes</span> : 'No'}</p>
        </div>
        
        {!config.staff2faEnabled ? (
          <p className="muted">2FA is disabled in environment variables (STAFF_2FA_ENABLED).</p>
        ) : (
          <>
            <button 
              type="button" 
              className="primary" 
              onClick={handleSetup2fa} 
              disabled={setting2fa}
            >
              {setting2fa ? 'Setting up…' : 'Setup 2FA / Show QR Code'}
            </button>
            
            {twoFaError && <p className="error" style={{ marginTop: '0.5rem' }}>{twoFaError}</p>}
            
            {twoFaData && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#27272a', borderRadius: '8px' }}>
                <p style={{ marginTop: 0 }}>Scan this QR code with your authenticator app:</p>
                <div style={{ background: '#fff', padding: '1rem', borderRadius: '8px', display: 'inline-block' }}>
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFaData.qrUrl)}`} 
                    alt="2FA QR Code" 
                    style={{ display: 'block' }}
                  />
                </div>
                <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                  <strong>Manual entry secret:</strong><br />
                  <code style={{ background: '#18181b', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>{twoFaData.secret}</code>
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Issuers</h3>
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Status</th><th>Created</th></tr>
          </thead>
          <tbody>
            {(Array.isArray(issuers) ? issuers : []).map((i) => (
              <tr key={i.id}>
                <td><code>{i.id}</code></td>
                <td>{i.name}</td>
                <td>{i.status}</td>
                <td>{i.created_at ? new Date(i.created_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {issuers.length === 0 && <p className="muted">No issuers configured.</p>}
      </div>
    </>
  );
}
