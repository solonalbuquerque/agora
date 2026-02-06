import { useState, useEffect } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function Statistics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  const { security_counters } = data;

  return (
    <>
      <PageHeader title="Statistics" onReload={load} loading={loading} />

      {security_counters ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Security counters (24h)</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(security_counters).map(([key, val]) => (
                <tr key={key}>
                  <td>{key.replace(/_/g, ' ')}</td>
                  <td>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No security counters available.</p>
      )}
    </>
  );
}
