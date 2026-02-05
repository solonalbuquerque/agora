import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import SlideModal from '../components/SlideModal';

const emptyForm = () => ({
  name: '',
  faucet_daily_limit_cents: '',
  max_transfer_per_tx_cents: '',
  allow_paid_services: false,
  auto_rule_min_calls: '',
  auto_rule_min_success_rate_pct: '',
  auto_rule_min_account_days: '',
});

export default function TrustLevels() {
  const navigate = useNavigate();
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminLevel, setAdminLevel] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const loadLevels = () => {
    return api.trustLevels()
      .then((r) => setLevels(r?.data?.rows || []))
      .catch((err) => {
        if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
          navigate('/login', { replace: true });
          return;
        }
        setError(err?.message || 'Failed to load trust levels');
      });
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    loadLevels().finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    if (adminLevel != null) {
      setForm({
        name: adminLevel.name ?? '',
        faucet_daily_limit_cents: adminLevel.faucet_daily_limit_cents ?? '',
        max_transfer_per_tx_cents: adminLevel.max_transfer_per_tx_cents ?? '',
        allow_paid_services: Boolean(adminLevel.allow_paid_services),
        auto_rule_min_calls: adminLevel.auto_promotion?.min_calls ?? '',
        auto_rule_min_success_rate_pct: adminLevel.auto_promotion?.min_success_rate_pct ?? '',
        auto_rule_min_account_days: adminLevel.auto_promotion?.min_account_days ?? '',
      });
      setSaveError('');
    }
  }, [adminLevel]);

  return (
    <>
      <PageHeader
        title="Trust Levels"
        onReload={() => window.location.reload()}
        loading={loading}
      />
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Agent trust levels define benefits (e.g. faucet limits, paid services) and auto-promotion rules.
        Change an agent&apos;s level on their detail page (Agents → select agent → Trust Level).
      </p>
      {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Level</th>
                <th>Name</th>
                <th>Faucet daily limit (cents)</th>
                <th>Max transfer/tx (cents)</th>
                <th>Paid services</th>
                <th>Auto-promotion (to next level)</th>
                <th style={{ width: '90px' }}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.level}>
                  <td>{l.level}</td>
                  <td>{l.name}</td>
                  <td>{l.faucet_daily_limit_cents?.toLocaleString() ?? '–'}</td>
                  <td>{l.max_transfer_per_tx_cents != null ? l.max_transfer_per_tx_cents.toLocaleString() : 'No cap'}</td>
                  <td>{l.allow_paid_services ? 'Yes' : 'No'}</td>
                  <td>
                    {l.auto_promotion ? (
                      <span>
                        min {l.auto_promotion.min_calls} calls, {l.auto_promotion.min_success_rate_pct}% success,
                        {' '}{l.auto_promotion.min_account_days} days
                      </span>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="primary small"
                      onClick={() => setAdminLevel(l)}
                      title={`Edit trust level ${l.level} (${l.name})`}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {levels.length === 0 && !loading && <p className="muted">No trust levels defined.</p>}
        </div>
      )}

      <SlideModal
        isOpen={adminLevel != null}
        onClose={() => { setAdminLevel(null); setSaveError(''); }}
        title={adminLevel != null ? `Edit Trust Level ${adminLevel.level}` : ''}
      >
        {adminLevel != null && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSaving(true);
              setSaveError('');
              const isEmpty = (val) => val === '' || val === null || val === undefined;
              const body = {
                name: form.name.trim() || undefined,
                faucet_daily_limit_cents: isEmpty(form.faucet_daily_limit_cents) ? undefined : Number(form.faucet_daily_limit_cents),
                max_transfer_per_tx_cents: isEmpty(form.max_transfer_per_tx_cents) ? null : Number(form.max_transfer_per_tx_cents),
                allow_paid_services: form.allow_paid_services,
                auto_rule_min_calls: isEmpty(form.auto_rule_min_calls) ? null : Number(form.auto_rule_min_calls),
                auto_rule_min_success_rate_pct: isEmpty(form.auto_rule_min_success_rate_pct) ? null : Number(form.auto_rule_min_success_rate_pct),
                auto_rule_min_account_days: isEmpty(form.auto_rule_min_account_days) ? null : Number(form.auto_rule_min_account_days),
              };
              api.updateTrustLevel(adminLevel.level, body)
                .then(() => {
                  setAdminLevel(null);
                  return loadLevels();
                })
                .catch((err) => setSaveError(err?.message || 'Failed to save'))
                .finally(() => setSaving(false));
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div>
              <label>Level</label>
              <div style={{ padding: '0.5rem 0', color: '#a1a1aa' }}>{adminLevel.level} (read-only)</div>
            </div>
            <div>
              <label htmlFor="tl-name">Name</label>
              <input
                id="tl-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Verified"
              />
            </div>
            <div>
              <label htmlFor="tl-faucet">Faucet daily limit (cents)</label>
              <input
                id="tl-faucet"
                type="number"
                min={0}
                value={form.faucet_daily_limit_cents}
                onChange={(e) => setForm((f) => ({ ...f, faucet_daily_limit_cents: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="tl-max-transfer">Max transfer per transaction (cents)</label>
              <input
                id="tl-max-transfer"
                type="number"
                min={0}
                placeholder="Empty = no cap"
                value={form.max_transfer_per_tx_cents}
                onChange={(e) => setForm((f) => ({ ...f, max_transfer_per_tx_cents: e.target.value }))}
              />
              <span className="muted" style={{ fontSize: '0.8rem' }}> Leave empty for no cap.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                id="tl-paid"
                type="checkbox"
                checked={form.allow_paid_services}
                onChange={(e) => setForm((f) => ({ ...f, allow_paid_services: e.target.checked }))}
              />
              <label htmlFor="tl-paid" style={{ marginBottom: 0 }}>Allow paid services</label>
            </div>
            <div style={{ borderTop: '1px solid #27272a', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <label style={{ marginBottom: '0.5rem' }}>Auto-promotion (to next level)</label>
              <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>Leave empty for no auto-promotion (e.g. top level).</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label htmlFor="tl-min-calls" style={{ fontSize: '0.8rem' }}>Min calls</label>
                  <input
                    id="tl-min-calls"
                    type="number"
                    min={0}
                    placeholder="–"
                    value={form.auto_rule_min_calls}
                    onChange={(e) => setForm((f) => ({ ...f, auto_rule_min_calls: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="tl-min-rate" style={{ fontSize: '0.8rem' }}>Min success rate %</label>
                  <input
                    id="tl-min-rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    placeholder="–"
                    value={form.auto_rule_min_success_rate_pct}
                    onChange={(e) => setForm((f) => ({ ...f, auto_rule_min_success_rate_pct: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="tl-min-days" style={{ fontSize: '0.8rem' }}>Min account days</label>
                  <input
                    id="tl-min-days"
                    type="number"
                    min={0}
                    placeholder="–"
                    value={form.auto_rule_min_account_days}
                    onChange={(e) => setForm((f) => ({ ...f, auto_rule_min_account_days: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            {saveError && <p className="error" style={{ margin: 0 }}>{saveError}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setAdminLevel(null); setSaveError(''); }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </SlideModal>
    </>
  );
}
