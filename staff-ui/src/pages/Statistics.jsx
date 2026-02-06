import { useState, useEffect } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

const ENTITY_LABELS = {
  agents: 'Agents',
  humans: 'Humans',
  services: 'Services',
  executions: 'Executions',
  ledger_entries: 'Ledger entries',
};

export default function Statistics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState(null);

  const handleBackup = () => {
    setBackupError(null);
    setBackupLoading(true);
    api
      .downloadBackup()
      .then(() => {})
      .catch((e) => setBackupError(e?.message ?? 'Backup failed'))
      .finally(() => setBackupLoading(false));
  };

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .statistics()
      .then((r) => setData(r?.data ?? null))
      .catch((e) => setError(e?.message ?? 'Failed to load statistics'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Statistics" onReload={load} loading={loading} />
        <p className="error">{error}</p>
      </>
    );
  }

  if (!data) {
    return (
      <PageHeader title="Statistics" onReload={load} loading={loading} />
    );
  }

  const { totals, last_24h, yesterday, pct_vs_yesterday, db_sizes, total_db_pretty } = data;

  return (
    <>
      <PageHeader title="Statistics" onReload={load} loading={loading} />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Entity counts</h3>
        <p className="muted">Total, last 24 hours, yesterday, and % change vs yesterday.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Total</th>
              <th>Last 24h</th>
              <th>Yesterday</th>
              <th>% vs yesterday</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(ENTITY_LABELS).map((key) => (
              <tr key={key}>
                <td>{ENTITY_LABELS[key]}</td>
                <td>{totals?.[key] ?? 0}</td>
                <td>{last_24h?.[key] ?? 0}</td>
                <td>{yesterday?.[key] ?? 0}</td>
                <td>
                  {pct_vs_yesterday?.[key] != null ? (
                    <span className={pct_vs_yesterday[key] >= 0 ? 'success' : ''}>
                      {pct_vs_yesterday[key] > 0 ? '+' : ''}{pct_vs_yesterday[key]}%
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Database sizes</h3>
          <button
            type="button"
            className="primary"
            onClick={handleBackup}
            disabled={backupLoading}
          >
            {backupLoading ? 'Downloading…' : 'Backup'}
          </button>
        </div>
        {backupError && <p className="error" style={{ marginTop: 0 }}>{backupError}</p>}
        <p className="muted">Size per table (PostgreSQL) and total database size. Backup dumps all tables as JSON in a ZIP file.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {(db_sizes || []).map((row) => (
              <tr key={row.table}>
                <td><code>{row.table}</code></td>
                <td>{row.size_pretty}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 'bold', borderTop: '1px solid var(--border)' }}>
              <td>Total (database)</td>
              <td>{total_db_pretty ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
