import { useState, useEffect } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import { dataRetention as mockSettings, dataRetentionPreview as mockPreview } from '../data/mockSecurity';

export default function DataRetention() {
  const [settings, setSettings] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [executionRetention, setExecutionRetention] = useState('');
  const [auditRetention, setAuditRetention] = useState('');

  const load = () => {
    setLoadError('');
    setLoading(true);
    Promise.all([
      api.dataRetention().catch(() => ({ data: mockSettings })),
      api.dataRetentionPreview?.()?.catch(() => ({ data: mockPreview })) ?? Promise.resolve({ data: mockPreview }),
    ])
      .then(([retRes, prevRes]) => {
        const s = retRes?.data ?? retRes ?? mockSettings;
        setSettings(s);
        setExecutionRetention(String(s.execution_retention_days ?? ''));
        setAuditRetention(String(s.audit_log_retention_days ?? ''));
        setPreview(prevRes?.data ?? prevRes ?? mockPreview);
      })
      .catch((e) => {
        setLoadError(e?.message ?? 'Failed to load');
        setSettings(mockSettings);
        setPreview(mockPreview);
        setExecutionRetention(String(mockSettings.execution_retention_days ?? ''));
        setAuditRetention(String(mockSettings.audit_log_retention_days ?? ''));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const exec = parseInt(executionRetention, 10);
    const audit = parseInt(auditRetention, 10);
    if (isNaN(exec) || exec < 1) {
      alert('Execution retention must be a positive number of days');
      return;
    }
    if (isNaN(audit) || audit < 1) {
      alert('Audit log retention must be a positive number of days');
      return;
    }
    setSaving(true);
    try {
      await api.dataRetentionUpdate({
        execution_retention_days: exec,
        audit_log_retention_days: audit,
      });
      load();
    } catch (e) {
      alert(e?.message ?? 'Save failed (backend not implemented)');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    try {
      const r = await api.dataRetentionPreview?.() ?? Promise.reject(new Error('Not implemented'));
      setPreview(r?.data ?? r ?? mockPreview);
    } catch (e) {
      alert(e?.message ?? 'Preview failed');
    }
  };

  const handleRun = async () => {
    if (!confirm('Run cleanup now? This will permanently delete old data.')) return;
    setRunning(true);
    try {
      await api.dataRetentionRun?.() ?? Promise.reject(new Error('Not implemented'));
      load();
    } catch (e) {
      alert(e?.message ?? 'Run cleanup failed (backend not implemented)');
    } finally {
      setRunning(false);
    }
  };

  if (!settings) {
    return <PageHeader title="Data Retention" onReload={load} loading={loading} />;
  }

  return (
    <>
      <PageHeader title="Data Retention" onReload={load} loading={loading} />
      {loadError && <p className="error" style={{ marginBottom: '1rem' }}>{loadError} (showing mock data)</p>}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Retention settings</h3>
        <p className="muted">Configure how long to keep execution and audit log data before cleanup.</p>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Execution retention (days)</label>
            <input
              type="number"
              min={1}
              value={executionRetention}
              onChange={(e) => setExecutionRetention(e.target.value)}
              placeholder="90"
              style={{ maxWidth: '8rem' }}
            />
          </div>
          <div>
            <label>Audit log retention (days)</label>
            <input
              type="number"
              min={1}
              value={auditRetention}
              onChange={(e) => setAuditRetention(e.target.value)}
              placeholder="365"
              style={{ maxWidth: '8rem' }}
            />
          </div>
          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Cleanup actions</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={handlePreview}>Preview cleanup impact</button>
          <button type="button" className="danger" onClick={handleRun} disabled={running}>
            {running ? 'Running…' : 'Run cleanup now'}
          </button>
        </div>
        {preview && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#27272a', borderRadius: '6px' }}>
            <p style={{ margin: 0 }}><strong>Preview:</strong> {preview.executions_to_delete ?? 0} executions and {preview.audit_events_to_delete ?? 0} audit events would be deleted.</p>
          </div>
        )}
      </div>
    </>
  );
}
