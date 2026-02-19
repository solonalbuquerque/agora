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

function CopyButton({ text, label = 'Copy' }) {
  const [fb, setFb] = useState('');
  const copy = () => {
    navigator.clipboard?.writeText(text)
      .then(() => { setFb('Copied!'); setTimeout(() => setFb(''), 2000); })
      .catch(() => setFb('Failed'));
  };
  return (
    <>
      <button type="button" className="secondary" style={{ marginLeft: '0.5rem' }} onClick={copy}>{label}</button>
      {fb && <span className="muted" style={{ fontSize: '0.8rem', marginLeft: '0.25rem' }}>{fb}</span>}
    </>
  );
}

function InfoRow({ label, children }) {
  return (
    <tr>
      <td style={{ paddingRight: '1.5rem', paddingBottom: '0.4rem', color: '#a1a1aa', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{label}</td>
      <td style={{ paddingBottom: '0.4rem' }}>{children}</td>
    </tr>
  );
}

export default function Instance() {
  const [instance, setInstance] = useState(null);
  const [appConfig, setAppConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Register
  const [registerForm, setRegisterForm] = useState({ name: '', owner_email: '', slug: '', license_code: '' });
  const [registering, setRegistering] = useState(false);
  const [centerToken, setCenterToken] = useState('');

  // Advanced: manual activate
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activateForm, setActivateForm] = useState({ instance_id: '', registration_code: '', activation_token: '', official_issuer_id: '' });
  const [activating, setActivating] = useState(false);

  // Advanced: change instance
  const [showSetForm, setShowSetForm] = useState(false);
  const [setForm, setSetForm] = useState({ instance_id: '', instance_token: '' });
  const [setFormSaving, setSetFormSaving] = useState(false);

  // Sync
  const [syncPolicyLoading, setSyncPolicyLoading] = useState(false);
  const [syncAgoLoading, setSyncAgoLoading] = useState(false);
  const [syncAgoFeedback, setSyncAgoFeedback] = useState('');

  // Derived
  const localInst = instance?.id ? instance : null;
  const isRegistered = localInst?.status === 'registered';
  const configuredId = instance?.configured_instance_id ?? localInst?.id ?? null;
  const isConfigured = !!configuredId;
  const ci = instance?.center_instance_info;
  const displayName = localInst?.name ?? ci?.name ?? null;
  const displaySlug = ci?.slug ?? null;
  const displayStatus = localInst?.status ?? ci?.status ?? null;
  const displayBadge = displayStatus ? (STATUS_BADGES[displayStatus] ?? { label: displayStatus, className: '' }) : null;
  const central_sync_available = instance?.central_sync_available === true;
  const totalAgoUnits = ((Number(instance?.total_ago_cents ?? 0)) / 100).toFixed(2);
  const centerTreasury = instance?.center_treasury;
  const centerAllocatedUnits = centerTreasury ? (Number(centerTreasury.allocated_cents) / 100).toFixed(2) : null;
  const centerAvailableUnits = centerTreasury ? (Number(centerTreasury.available_cents) / 100).toFixed(2) : null;
  const treasuryAgentId = instance?.treasury_agent_id ?? null;
  const [creatingTreasuryAgent, setCreatingTreasuryAgent] = useState(false);
  const centralUrl = appConfig?.agora_center_url ?? '';
  const baseUrl = appConfig?.base_url ?? '';
  const envConflict = instance?.env_conflict === true;
  const envInstanceId = instance?.env_instance_id ?? null;

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const [instData, cfgData] = await Promise.all([
        api.instance().then((r) => r?.data ?? null).catch(() => null),
        api.config().then((r) => r?.data ?? null).catch(() => null),
      ]);
      setInstance(instData);
      setAppConfig(cfgData);
      const id = instData?.id ?? instData?.configured_instance_id;
      if (id) {
        setActivateForm((f) => ({ ...f, instance_id: id }));
        setSetForm((f) => ({ ...f, instance_id: id }));
      }
    } catch (e) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!registerForm.name?.trim() || !registerForm.owner_email?.trim()) { setError('Name and owner email are required'); return; }
    if (centralUrl && !registerForm.slug?.trim()) { setError('Slug is required when registering with Central'); return; }
    setError('');
    setRegistering(true);
    try {
      const body = { name: registerForm.name.trim(), owner_email: registerForm.owner_email.trim() };
      if (centralUrl) {
        body.slug = registerForm.slug.trim();
        if (registerForm.license_code?.trim()) body.license_code = registerForm.license_code.trim();
      }
      await api.instanceRegister(body, centerToken?.trim() || null);
      await load();
    } catch (e) {
      setError(e?.data?.message ?? e?.message ?? 'Register failed');
    } finally {
      setRegistering(false);
    }
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!activateForm.instance_id?.trim() || !activateForm.registration_code?.trim()) { setError('Instance ID and registration code are required'); return; }
    if (!centralUrl && !activateForm.activation_token?.trim()) { setError('Activation token is required when Central is not configured'); return; }
    setError('');
    setActivating(true);
    try {
      const body = { instance_id: activateForm.instance_id.trim(), registration_code: activateForm.registration_code.trim() };
      if (activateForm.activation_token?.trim()) body.activation_token = activateForm.activation_token.trim();
      if (activateForm.official_issuer_id?.trim()) body.official_issuer_id = activateForm.official_issuer_id.trim();
      await api.instanceActivate(body, centerToken?.trim() || null);
      setShowAdvanced(false);
      await load();
    } catch (e) {
      setError(e?.message || 'Activation failed');
    } finally {
      setActivating(false);
    }
  };

  const handleSetConfig = async (e) => {
    e.preventDefault();
    if (!setForm.instance_id?.trim()) { setError('Instance ID is required'); return; }
    setSetFormSaving(true);
    setError('');
    try {
      await api.instanceSetConfig({
        instance_id: setForm.instance_id.trim(),
        ...(setForm.instance_token?.trim() && { instance_token: setForm.instance_token.trim() }),
      });
      setSetForm((f) => ({ ...f, instance_token: '' }));
      setShowSetForm(false);
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to save.');
    } finally {
      setSetFormSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Instance &amp; Central" onReload={load} loading={loading} />
      {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* ── 1. AGORA-CENTER URL ─────────────────────────────────── */}
      <div className="card" style={{ borderLeft: '4px solid #7c3aed' }}>
        <h3 style={{ marginTop: 0 }}>AGORA-CENTER — Connection</h3>
        {centralUrl ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <code style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', background: '#27272a', padding: '0.5rem', borderRadius: 4 }}>{centralUrl}</code>
              <CopyButton text={centralUrl} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>Central token <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>(optional)</span></label>
              <input type="password" value={centerToken} onChange={(e) => setCenterToken(e.target.value)} placeholder="Bearer eyJ… — only needed for the human-login flow" style={{ width: '100%', maxWidth: '32rem', fontFamily: 'monospace' }} />
            </div>
          </>
        ) : (
          <p className="muted">Not configured. Set <code>AGORA_CENTER_URL</code> in <code>.env</code> to enable Central integration.</p>
        )}
      </div>

      {/* ── ENV CONFLICT WARNING ──────────────────────────────── */}
      {!loading && envConflict && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b', background: '#1c1a10' }}>
          <strong style={{ color: '#fbbf24' }}>⚠ INSTANCE_ID conflict</strong>
          <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
            Your <code>.env</code> has <code>INSTANCE_ID={envInstanceId}</code>, but the panel registered a different instance (<code>{configuredId}</code>).
            The panel registration is now active. To avoid this warning, remove or update <code>INSTANCE_ID</code> in <code>.env</code> to match: <code>{configuredId}</code>
          </p>
        </div>
      )}

      {loading ? (
        <p className="muted" style={{ marginTop: '1rem' }}>Loading…</p>
      ) : (
        <>
          {/* ── 2. REGISTERED — full info ──────────────────────────── */}
          {isRegistered && (
            <>
              <div className="card" style={{ borderLeft: '4px solid #059669' }}>
                <h3 style={{ marginTop: 0 }} className="success">✓ Instance active</h3>
                <table>
                  <tbody>
                    {displayName && <InfoRow label="Name"><strong>{displayName}</strong></InfoRow>}
                    {displaySlug && <InfoRow label="Slug"><code>{displaySlug}</code></InfoRow>}
                    <InfoRow label="Instance ID">
                      <code style={{ background: '#27272a', padding: '0.2rem 0.4rem', borderRadius: 4 }}>{configuredId}</code>
                      <CopyButton text={configuredId} />
                    </InfoRow>
                    <InfoRow label="Status">
                      <span className={displayBadge?.className}>{displayBadge?.label}</span>
                    </InfoRow>
                    <InfoRow label="Compliant">
                      {localInst.compliant ? <span className="success">Yes</span> : <span className="error">No</span>}
                    </InfoRow>
                    <InfoRow label="Export services">{localInst.export_services_enabled ? 'Enabled' : 'Disabled'}</InfoRow>
                    <InfoRow label="Last seen">{localInst.last_seen_at ? new Date(localInst.last_seen_at).toLocaleString() : '—'}</InfoRow>
                    <InfoRow label="Registered">{localInst.registered_at ? new Date(localInst.registered_at).toLocaleString() : '—'}</InfoRow>
                  </tbody>
                </table>
                {!showSetForm && (
                  <button type="button" className="secondary" style={{ marginTop: '0.75rem' }} onClick={() => { setShowSetForm(true); setSetForm((f) => ({ ...f, instance_id: configuredId ?? '' })); }}>
                    Change instance
                  </button>
                )}
              </div>

              {/* Change instance form */}
              {showSetForm && (
                <div className="card" style={{ borderLeft: '4px solid #7c3aed' }}>
                  <h3 style={{ marginTop: 0 }}>Change instance</h3>
                  <form onSubmit={handleSetConfig}>
                    <div className="form-row">
                      <label>Instance ID</label>
                      <input value={setForm.instance_id} onChange={(e) => setSetForm((f) => ({ ...f, instance_id: e.target.value }))} placeholder="UUID from Center" style={{ maxWidth: '28rem', fontFamily: 'monospace' }} />
                    </div>
                    <div className="form-row">
                      <label>Instance Token <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>(optional — leave empty to keep current)</span></label>
                      <input type="password" value={setForm.instance_token} onChange={(e) => setSetForm((f) => ({ ...f, instance_token: e.target.value }))} placeholder="Activation token" style={{ maxWidth: '28rem', fontFamily: 'monospace' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="submit" className="primary" disabled={setFormSaving}>{setFormSaving ? 'Saving…' : 'Save'}</button>
                      <button type="button" className="secondary" onClick={() => setShowSetForm(false)}>Cancel</button>
                    </div>
                  </form>
                </div>
              )}

              {/* AGO Balance */}
              <div className="card">
                <h3 style={{ marginTop: 0 }}>AGO Balance &amp; Sync</h3>
                <div className="instance-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))', marginBottom: '1rem' }}>
                  <div className="instance-block">
                    <label>Local wallets (this deployment)</label>
                    <span className="instance-ago-balance">{totalAgoUnits} AGO</span>
                  </div>
                  {centerAllocatedUnits !== null && (
                    <div className="instance-block">
                      <label>Center treasury (allocated)</label>
                      <span className="instance-ago-balance" style={{ color: '#fbbf24' }}>{centerAllocatedUnits} AGO</span>
                    </div>
                  )}
                  {centerAvailableUnits !== null && (
                    <div className="instance-block">
                      <label>Center treasury (available)</label>
                      <span>{centerAvailableUnits} AGO</span>
                    </div>
                  )}
                  <div className="instance-block">
                    <label>Center sync</label>
                    <span className={central_sync_available ? 'success' : 'muted'}>{central_sync_available ? 'Ready' : 'Not configured'}</span>
                  </div>
                </div>

                {/* Treasury agent info / setup */}
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#1c1c22', borderRadius: 6, fontSize: '0.875rem' }}>
                  {treasuryAgentId ? (
                    <>
                      <strong style={{ color: '#a1a1aa' }}>Treasury agent</strong>
                      <div style={{ marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <code style={{ background: '#27272a', padding: '0.2rem 0.4rem', borderRadius: 4, fontSize: '0.82rem' }}>{treasuryAgentId}</code>
                        <CopyButton text={treasuryAgentId} />
                      </div>
                      <p className="muted" style={{ margin: '0.3rem 0 0', fontSize: '0.82rem' }}>
                        AGO credits from the Center without a specific <em>to_agent_ref</em> go to this agent's wallet.
                      </p>
                    </>
                  ) : (
                    <>
                      <strong style={{ color: '#fbbf24' }}>⚠ No treasury agent set</strong>
                      <p className="muted" style={{ margin: '0.3rem 0 0.5rem', fontSize: '0.82rem' }}>
                        Credits from the Center without a specific agent ref will be skipped. Create the treasury agent to receive them.
                      </p>
                      <button
                        type="button"
                        className="primary"
                        style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}
                        disabled={creatingTreasuryAgent}
                        onClick={async () => {
                          setCreatingTreasuryAgent(true);
                          try { await api.instanceEnsureTreasuryAgent(); await load(); }
                          catch (e) { setError(e?.message || 'Failed to create treasury agent'); }
                          finally { setCreatingTreasuryAgent(false); }
                        }}
                      >
                        {creatingTreasuryAgent ? 'Creating…' : 'Create treasury agent'}
                      </button>
                    </>
                  )}
                </div>

                {centerAllocatedUnits !== null && Number(centerAllocatedUnits) > 0 && Number(totalAgoUnits) < Number(centerAllocatedUnits) && (
                  <div style={{ background: '#1c1a10', border: '1px solid #f59e0b', borderRadius: 6, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    <strong style={{ color: '#fbbf24' }}>Center has {centerAllocatedUnits} AGO allocated to this instance.</strong>
                    <p className="muted" style={{ margin: '0.3rem 0 0' }}>
                      Click <strong>Sync AGOs</strong> to pull these credits into local wallets.
                      Credits without a specific agent ref will go to the treasury agent above.
                    </p>
                  </div>
                )}

                {centralUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" className="secondary" disabled={syncAgoLoading || !central_sync_available} onClick={async () => {
                      setSyncAgoLoading(true); setSyncAgoFeedback('');
                      try { await api.centralSyncAgo(); setSyncAgoFeedback('Sync completed.'); await load(); }
                      catch (e) { setSyncAgoFeedback(e?.message || 'Sync failed.'); }
                      finally { setSyncAgoLoading(false); setTimeout(() => setSyncAgoFeedback(''), 3000); }
                    }}>
                      {syncAgoLoading ? 'Syncing…' : 'Sync AGOs with Center'}
                    </button>
                    {syncAgoFeedback && <span className={syncAgoFeedback === 'Sync completed.' ? 'success' : 'error'} style={{ fontSize: '0.9rem' }}>{syncAgoFeedback}</span>}
                  </div>
                )}
                <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0, fontSize: '0.82rem' }}>
                  <strong>Note:</strong> "Issue AGO" in the Center only creates supply (prints money). To credit this instance, go to the Center → instance page → <em>Credit instance (AGO)</em>.
                  Specifying a <em>to_agent_ref</em> credits that agent directly; leaving it empty credits the treasury agent.
                  After crediting, click <strong>Sync AGOs</strong> here.
                </p>
              </div>

              {/* Central Compliance */}
              {centralUrl && (instance?.central_policy || central_sync_available) && (
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>Central Compliance &amp; Trust</h3>
                  {instance?.central_policy ? (
                    <>
                      <table>
                        <tbody>
                          <InfoRow label="Trust level">{instance.central_policy.trust_level ?? '—'}</InfoRow>
                          <InfoRow label="Visibility">{instance.central_policy.visibility_status ?? '—'}</InfoRow>
                          {instance.central_policy.policy && (
                            <InfoRow label="Policy">
                              <span className="muted" style={{ fontSize: '0.9rem' }}>
                                Paid export: {instance.central_policy.policy.allow_paid_services_export ? 'Yes' : 'No'}
                                {' · '}Concurrent: {instance.central_policy.policy.max_concurrent_remote_executions ?? '—'}
                                {' · '}Per exec: {instance.central_policy.policy.max_value_per_execution_ago ?? '—'} AGO
                                {' · '}Daily: {instance.central_policy.policy.max_daily_execution_value_ago ?? '—'} AGO
                              </span>
                            </InfoRow>
                          )}
                          <InfoRow label="Last synced">{instance.central_policy.updated_at ? new Date(instance.central_policy.updated_at).toLocaleString() : '—'}</InfoRow>
                        </tbody>
                      </table>
                      <p className="muted" style={{ marginBottom: '0.5rem', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                        Paid AGO services may be suspended if trust policy disallows export.
                      </p>
                    </>
                  ) : (
                    <p className="muted" style={{ marginBottom: '0.5rem' }}>Policy not yet synced. Click below to fetch from Center.</p>
                  )}
                  <button type="button" className="secondary" disabled={syncPolicyLoading} onClick={async () => {
                    setSyncPolicyLoading(true);
                    try { await api.instanceSyncPolicy(); await load(); }
                    catch (e) { setError(e?.message || 'Sync failed'); }
                    finally { setSyncPolicyLoading(false); }
                  }}>
                    {syncPolicyLoading ? 'Syncing…' : 'Sync policy now'}
                  </button>
                </div>
              )}

              {/* Public manifest */}
              {baseUrl && (
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>Public manifest</h3>
                  <p className="muted" style={{ marginBottom: '0.5rem' }}><code>{baseUrl}/.well-known/agora.json</code></p>
                  <CopyButton text={`${baseUrl}/.well-known/agora.json`} label="Copy URL" />
                </div>
              )}
            </>
          )}

          {/* ── 3. NOT REGISTERED — setup ──────────────────────────── */}
          {!isRegistered && (
            <>
              {/* Instance exists on Center but not activated locally — show what we know */}
              {isConfigured && !isRegistered && (
                <div className="card" style={{ borderLeft: '4px solid #d97706' }}>
                  <h3 style={{ marginTop: 0, color: '#fbbf24' }}>Instance — Not yet active</h3>
                  <table>
                    <tbody>
                      {displayName && <InfoRow label="Name"><strong>{displayName}</strong></InfoRow>}
                      {displaySlug && <InfoRow label="Slug"><code>{displaySlug}</code></InfoRow>}
                      <InfoRow label="Instance ID">
                        <code style={{ background: '#27272a', padding: '0.2rem 0.4rem', borderRadius: 4 }}>{configuredId}</code>
                        <CopyButton text={configuredId} />
                      </InfoRow>
                    </tbody>
                  </table>
                  <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0, fontSize: '0.9rem' }}>
                    Click <strong>⚡ Register & Activate</strong> below to create a fresh, fully activated instance in one click.
                    A new Instance ID will be generated and the system will use it immediately.
                  </p>
                </div>
              )}

              {/* Register — primary action */}
              <div className="card" style={{ borderLeft: centralUrl ? '4px solid #059669' : undefined }}>
                <h3 style={{ marginTop: 0 }}>Register this deployment</h3>
                {centralUrl ? (
                  <div className="muted" style={{ marginBottom: '1rem', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    <strong style={{ color: '#e4e4e7' }}>One click — fully automatic.</strong> Fills in name, slug and email below, then click Register.
                    The system will register <em>and</em> activate the instance immediately.
                    Instance ID and token are saved in the database — no <code>.env</code> change or server restart needed.
                  </div>
                ) : (
                  <p className="muted" style={{ marginBottom: '1rem' }}>
                    Create a new instance. After registering, complete activation below with the registration code and an activation token from your Central/issuer.
                  </p>
                )}
                <form onSubmit={handleRegister}>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="form-row" style={{ flex: '1 1 12rem' }}>
                      <label>Name</label>
                      <input value={registerForm.name} onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Agora Instance" />
                    </div>
                    {centralUrl && (
                      <div className="form-row" style={{ flex: '1 1 12rem' }}>
                        <label>Slug <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>(unique, a-z 0-9 _ -)</span></label>
                        <input value={registerForm.slug} onChange={(e) => setRegisterForm((f) => ({ ...f, slug: e.target.value }))} placeholder="my-instance" />
                      </div>
                    )}
                  </div>
                  <div className="form-row">
                    <label>Owner email</label>
                    <input type="email" value={registerForm.owner_email} onChange={(e) => setRegisterForm((f) => ({ ...f, owner_email: e.target.value }))} placeholder="owner@example.com" />
                  </div>
                  {centralUrl && (
                    <div className="form-row">
                      <label>License code <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>(only if slug is reserved)</span></label>
                      <input value={registerForm.license_code} onChange={(e) => setRegisterForm((f) => ({ ...f, license_code: e.target.value }))} placeholder="Optional" />
                    </div>
                  )}
                  <button type="submit" className="primary" disabled={registering} style={{ minWidth: '9rem' }}>
                    {registering ? 'Registering…' : centralUrl ? '⚡ Register & Activate' : 'Register'}
                  </button>
                </form>
              </div>

              {/* Advanced options */}
              <div style={{ marginTop: '0.5rem' }}>
                <button type="button" className="secondary" style={{ fontSize: '0.85rem', padding: '0.25rem 0.75rem' }} onClick={() => setShowAdvanced((v) => !v)}>
                  {showAdvanced ? '▲ Hide advanced options' : '▼ Advanced options'}
                </button>
              </div>

              {showAdvanced && (
                <>
                  {/* Manual activate */}
                  <div className="card" style={{ marginTop: '0.5rem' }}>
                    <h3 style={{ marginTop: 0 }}>Manual activation</h3>
                    <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                      {centralUrl
                        ? 'Only needed for manual/advanced flows. Provide instance_id and registration_code — the activation token is fetched from Center automatically.'
                        : 'Provide instance_id, registration_code, and the activation token from your Central or issuer.'}
                    </p>
                    <form onSubmit={handleActivate}>
                      <div className="form-row">
                        <label>Instance ID</label>
                        <input value={activateForm.instance_id} onChange={(e) => setActivateForm((f) => ({ ...f, instance_id: e.target.value }))} placeholder="UUID" style={{ fontFamily: 'monospace' }} />
                      </div>
                      <div className="form-row">
                        <label>Registration code</label>
                        <input value={activateForm.registration_code} onChange={(e) => setActivateForm((f) => ({ ...f, registration_code: e.target.value }))} placeholder="One-time code from registration" style={{ fontFamily: 'monospace' }} />
                      </div>
                      {!centralUrl && (
                        <div className="form-row">
                          <label>Activation token</label>
                          <input value={activateForm.activation_token} onChange={(e) => setActivateForm((f) => ({ ...f, activation_token: e.target.value }))} placeholder="From Central or issuer" style={{ fontFamily: 'monospace' }} />
                        </div>
                      )}
                      <div className="form-row">
                        <label>Official issuer ID <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>(optional)</span></label>
                        <input value={activateForm.official_issuer_id} onChange={(e) => setActivateForm((f) => ({ ...f, official_issuer_id: e.target.value }))} placeholder="UUID" style={{ fontFamily: 'monospace' }} />
                      </div>
                      <button type="submit" className="primary" disabled={activating}>{activating ? 'Activating…' : 'Activate'}</button>
                    </form>
                  </div>

                  {/* Set instance ID */}
                  <div className="card" style={{ marginTop: '0.5rem' }}>
                    <h3 style={{ marginTop: 0 }}>Link existing instance by ID</h3>
                    <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                      If you already have an instance_id and token from the Center, set them here. The values are stored in the database and used at runtime.
                    </p>
                    <form onSubmit={handleSetConfig}>
                      <div className="form-row">
                        <label>Instance ID</label>
                        <input value={setForm.instance_id} onChange={(e) => setSetForm((f) => ({ ...f, instance_id: e.target.value }))} placeholder="UUID from Center" style={{ fontFamily: 'monospace' }} />
                      </div>
                      <div className="form-row">
                        <label>Instance Token <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>(optional)</span></label>
                        <input type="password" value={setForm.instance_token} onChange={(e) => setSetForm((f) => ({ ...f, instance_token: e.target.value }))} placeholder="Activation token" style={{ fontFamily: 'monospace' }} />
                      </div>
                      <button type="submit" className="primary" disabled={setFormSaving}>{setFormSaving ? 'Saving…' : 'Save'}</button>
                    </form>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
