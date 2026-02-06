import { useState, useEffect } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

const STATUS_BADGES = {
  registered: { label: 'Registered', className: 'success' },
  pending: { label: 'Pending', className: 'instance-badge-pending' },
  flagged: { label: 'Flagged', className: 'error' },
  blocked: { label: 'Blocked', className: 'error' },
  unregistered: { label: 'Unregistered', className: 'muted' },
};

function copyToClipboard(text, setFeedback) {
  if (!navigator?.clipboard?.writeText) {
    setFeedback?.('Copy not supported');
    return;
  }
  navigator.clipboard.writeText(text).then(() => setFeedback?.('Copied!')).catch(() => setFeedback?.('Failed'));
  if (setFeedback) setTimeout(() => setFeedback(''), 2000);
}

export default function Instance() {
  const [instance, setInstance] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');
  const [statusSelect, setStatusSelect] = useState('');
  const [updating, setUpdating] = useState(false);

  // Register flow
  const [registerForm, setRegisterForm] = useState({ name: '', owner_email: '' });
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState(null);

  // Activate flow
  const [activateForm, setActivateForm] = useState({ instance_id: '', registration_code: '', activation_token: '', official_issuer_id: '' });
  const [activating, setActivating] = useState(false);

  const hasInstance = instance?.id != null;
  const totalAgoCents = instance?.total_ago_cents ?? 0;
  const totalAgoUnits = (Number(totalAgoCents) / 100).toFixed(2);

  const load = () => {
    setError('');
    setLoading(true);
    Promise.all([
      api.instance().then((r) => r?.data ?? null).catch(() => null),
      api.config().then((r) => r?.data ?? null).catch(() => null),
    ])
      .then(([data, cfg]) => {
        setInstance(data);
        setConfig(cfg);
        setStatusSelect('');
        if (data?.id && !activateForm.instance_id) {
          setActivateForm((f) => ({ ...f, instance_id: data.id }));
        }
      })
      .catch((e) => {
        setInstance(null);
        setError(e?.message || 'Failed to load');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!registerForm.name?.trim() || !registerForm.owner_email?.trim()) {
      setError('Name and owner email are required');
      return;
    }
    setError('');
    setRegistering(true);
    try {
      const res = await api.instanceRegister({ name: registerForm.name.trim(), owner_email: registerForm.owner_email.trim() });
      const data = res?.data ?? res;
      setRegisterResult({
        instance_id: data.instance_id,
        registration_code: data.registration_code,
        status: data.status,
        expires_at: data.expires_at,
      });
      setActivateForm((f) => ({ ...f, instance_id: data.instance_id || f.instance_id }));
      load();
    } catch (e) {
      setError(e?.message || 'Register failed');
    } finally {
      setRegistering(false);
    }
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!activateForm.instance_id?.trim() || !activateForm.registration_code?.trim() || !activateForm.activation_token?.trim()) {
      setError('Instance ID, registration code and activation token are required');
      return;
    }
    setError('');
    setActivating(true);
    try {
      const body = {
        instance_id: activateForm.instance_id.trim(),
        registration_code: activateForm.registration_code.trim(),
        activation_token: activateForm.activation_token.trim(),
      };
      if (activateForm.official_issuer_id?.trim()) {
        body.official_issuer_id = activateForm.official_issuer_id.trim();
      }
      await api.instanceActivate(body);
      setRegisterResult(null);
      setActivateForm({ instance_id: '', registration_code: '', activation_token: '', official_issuer_id: '' });
      load();
    } catch (e) {
      setError(e?.message || 'Activation failed');
    } finally {
      setActivating(false);
    }
  };

  const handleStatusChange = async () => {
    if (!instance?.id || !statusSelect) return;
    setUpdating(true);
    try {
      await api.instanceUpdateStatus(instance.id, statusSelect);
      load();
    } catch (e) {
      setError(e?.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const badge = instance?.status ? STATUS_BADGES[instance.status] || { label: instance.status, className: '' } : null;
  const centralUrl = config?.agora_center_url ?? null;
  const baseUrl = config?.base_url ?? '';

  return (
    <>
      <PageHeader title="Instance &amp; Central" onReload={load} loading={loading} />
      {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* Central URL */}
      <div className="card" style={{ borderLeft: '4px solid #7c3aed' }}>
        <h3 style={{ marginTop: 0 }}>AGORA-CENTER — Connection endpoint</h3>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          URL do ponto de conexão com o Central (registro, ativação e sincronização). Configure <code>AGORA_CENTER_URL</code> no <code>.env</code>.
        </p>
        {centralUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <code style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', background: '#27272a', padding: '0.5rem', borderRadius: 4 }}>{centralUrl}</code>
            <button type="button" className="secondary" onClick={() => copyToClipboard(centralUrl, setCopyFeedback)}>Copy</button>
            {copyFeedback && <span className="muted" style={{ fontSize: '0.8rem' }}>{copyFeedback}</span>}
          </div>
        ) : (
          <p className="muted">Not configured. Set <code>AGORA_CENTER_URL</code> (or <code>CENTRAL_URL</code>) in your <code>.env</code>.</p>
        )}
      </div>

      {/* Status & AGO balance — always visible */}
      <div className="card instance-status-card">
        <h3 style={{ marginTop: 0 }}>Status &amp; balance AGO</h3>
        <div className="instance-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))' }}>
          <div className="instance-block">
            <label>Instance status</label>
            <span>
              {loading ? '…' : hasInstance ? (
                <>
                  {badge && <span className={badge.className}>{badge.label}</span>}
                  {!badge && instance?.status}
                </>
              ) : (
                <span className="muted">No instance</span>
              )}
            </span>
          </div>
          <div className="instance-block">
            <label>Compliant</label>
            <span>{loading ? '…' : hasInstance && instance?.compliant ? <span className="success">Yes</span> : <span className="muted">No</span>}</span>
          </div>
          <div className="instance-block">
            <label>AGO balance (this instance)</label>
            <span className="instance-ago-balance">{loading ? '…' : `${totalAgoUnits} AGO`}</span>
          </div>
        </div>
        <p className="muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>Total AGO in all wallets on this deployment. Use Financial → Balances to see per-agent.</p>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {/* Register — when no instance or show result */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>1. Register this deployment</h3>
            <p className="muted" style={{ marginBottom: '1rem' }}>Create a new instance and get <strong>Instance ID</strong> and <strong>Registration code</strong> (single use). Then set <code>INSTANCE_ID</code> in <code>.env</code> and configure at Central.</p>
            {registerResult ? (
              <div className="instance-register-result">
                <p><strong>Registration successful.</strong> Save the values below and set <code>INSTANCE_ID={registerResult.instance_id}</code> in your <code>.env</code>, then restart or reload.</p>
                <table style={{ marginTop: '0.5rem' }}>
                  <tbody>
                    <tr>
                      <td><strong>Instance ID</strong></td>
                      <td>
                        <code>{registerResult.instance_id}</code>
                        <button type="button" className="secondary" style={{ marginLeft: '0.5rem' }} onClick={() => copyToClipboard(registerResult.instance_id, setCopyFeedback)}>Copy</button>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Registration code</strong></td>
                      <td>
                        <code>{registerResult.registration_code}</code>
                        <button type="button" className="secondary" style={{ marginLeft: '0.5rem' }} onClick={() => copyToClipboard(registerResult.registration_code, setCopyFeedback)}>Copy</button>
                        <span className="muted" style={{ marginLeft: '0.5rem' }}>Use at Central to obtain activation token.</span>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Expires</strong></td>
                      <td>{registerResult.expires_at ? new Date(registerResult.expires_at).toLocaleString() : '—'}</td>
                    </tr>
                  </tbody>
                </table>
                {copyFeedback && <span className="muted" style={{ fontSize: '0.8rem' }}>{copyFeedback}</span>}
              </div>
            ) : (
              <form onSubmit={handleRegister}>
                <div className="form-row">
                  <label>Name</label>
                  <input value={registerForm.name} onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))} placeholder="Instance name" />
                </div>
                <div className="form-row">
                  <label>Owner email</label>
                  <input type="email" value={registerForm.owner_email} onChange={(e) => setRegisterForm((f) => ({ ...f, owner_email: e.target.value }))} placeholder="owner@example.com" />
                </div>
                <button type="submit" className="primary" disabled={registering}>{registering ? 'Registering…' : 'Register'}</button>
              </form>
            )}
          </div>

          {/* Configure at Central */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>2. Configure at Central</h3>
            <p className="muted" style={{ marginBottom: '0.5rem' }}>In the AGORA-CENTER dashboard (or API), register this instance with the <strong>Instance ID</strong> and <strong>Registration code</strong> from step 1. The Central will issue an <strong>Activation token</strong>. Paste that token in step 3.</p>
            {centralUrl ? (
              <a href={centralUrl} target="_blank" rel="noopener noreferrer" className="primary" style={{ display: 'inline-block', marginTop: '0.5rem' }}>Open AGORA-CENTER →</a>
            ) : (
              <p className="muted">Set <code>AGORA_CENTER_URL</code> to show the link.</p>
            )}
          </div>

          {/* Activate */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>3. Activate instance</h3>
            <p className="muted" style={{ marginBottom: '1rem' }}>After obtaining the activation token from the Central, complete activation below.</p>
            <form onSubmit={handleActivate}>
              <div className="form-row">
                <label>Instance ID</label>
                <input value={activateForm.instance_id} onChange={(e) => setActivateForm((f) => ({ ...f, instance_id: e.target.value }))} placeholder="UUID from step 1" />
              </div>
              <div className="form-row">
                <label>Registration code</label>
                <input value={activateForm.registration_code} onChange={(e) => setActivateForm((f) => ({ ...f, registration_code: e.target.value }))} placeholder="From step 1" />
              </div>
              <div className="form-row">
                <label>Activation token</label>
                <input value={activateForm.activation_token} onChange={(e) => setActivateForm((f) => ({ ...f, activation_token: e.target.value }))} placeholder="From Central" />
              </div>
              <div className="form-row">
                <label>Official issuer ID (optional)</label>
                <input value={activateForm.official_issuer_id} onChange={(e) => setActivateForm((f) => ({ ...f, official_issuer_id: e.target.value }))} placeholder="UUID" />
              </div>
              <button type="submit" className="primary" disabled={activating}>{activating ? 'Activating…' : 'Activate'}</button>
            </form>
          </div>

          {/* Instance details when registered */}
          {hasInstance && (
            <>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Instance details</h3>
                <table>
                  <tbody>
                    <tr>
                      <td><strong>Instance ID</strong></td>
                      <td>
                        <code>{instance.id}</code>
                        <button type="button" className="secondary" style={{ marginLeft: '0.5rem' }} onClick={() => copyToClipboard(instance.id, setCopyFeedback)}>Copy</button>
                        <p className="muted" style={{ marginTop: '0.25rem', marginBottom: 0, fontSize: '0.8rem' }}>Use as <code>INSTANCE_ID</code> in <code>.env</code>.</p>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Name</strong></td>
                      <td>{instance.name ?? '—'}</td>
                    </tr>
                    <tr>
                      <td><strong>Status</strong></td>
                      <td>{badge && <span className={badge.className}>{badge.label}</span>}{!badge && instance.status}</td>
                    </tr>
                    <tr>
                      <td><strong>Export services enabled</strong></td>
                      <td>{instance.export_services_enabled ? 'Yes' : 'No'}</td>
                    </tr>
                    <tr>
                      <td><strong>Last seen</strong></td>
                      <td>{instance.last_seen_at ? new Date(instance.last_seen_at).toLocaleString() : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {baseUrl && (
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>Public manifest</h3>
                  <p className="muted" style={{ marginBottom: '0.5rem' }}><code>{baseUrl}/.well-known/agora.json</code></p>
                  <button type="button" className="secondary" onClick={() => copyToClipboard(`${baseUrl}/.well-known/agora.json`, setCopyFeedback)}>Copy manifest URL</button>
                </div>
              )}
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Change status (admin)</h3>
                <p className="muted">Flag/Block will suspend all exported services.</p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <select value={statusSelect} onChange={(e) => setStatusSelect(e.target.value)} style={{ minWidth: '10rem' }}>
                    <option value="">Select status…</option>
                    <option value="registered">Registered</option>
                    <option value="flagged">Flagged</option>
                    <option value="blocked">Blocked</option>
                    <option value="unregistered">Unregistered</option>
                  </select>
                  <button type="button" className="primary" onClick={handleStatusChange} disabled={!statusSelect || updating}>
                    {updating ? 'Updating…' : 'Update'}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
