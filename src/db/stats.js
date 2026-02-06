'use strict';

const { query } = require('./index');

/**
 * Count rows in a table, optionally filtered by created_at (last 24h or yesterday).
 */
async function countTable(tableName, where = '') {
  const sql = `SELECT COUNT(*)::bigint AS n FROM ${tableName} ${where}`.trim();
  const res = await query(sql, []);
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * Get statistics for the staff dashboard: totals, last 24h, yesterday, % change, and DB sizes.
 */
async function getStatistics() {
  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  yesterdayStart.setUTCHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() + 1);

  const entities = [
    { key: 'agents', table: 'agents' },
    { key: 'humans', table: 'humans' },
    { key: 'services', table: 'services' },
    { key: 'executions', table: 'executions' },
    { key: 'ledger_entries', table: 'ledger_entries' },
  ];

  const totals = {};
  const last_24h = {};
  const yesterday = {};
  const pct_vs_yesterday = {};

  const yesterParams = [yesterdayStart.toISOString(), yesterdayEnd.toISOString()];

  for (const { key, table } of entities) {
    const [total, last24Res, yesterRes] = await Promise.all([
      countTable(table),
      query(`SELECT COUNT(*)::bigint AS n FROM ${table} WHERE created_at >= NOW() - INTERVAL '24 hours'`, []),
      query(
        `SELECT COUNT(*)::bigint AS n FROM ${table} WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
        yesterParams
      ),
    ]);
    const last24 = Number(last24Res.rows[0]?.n ?? 0);
    const yesterCount = Number(yesterRes.rows[0]?.n ?? 0);

    totals[key] = Number(total);
    last_24h[key] = last24;
    yesterday[key] = yesterCount;
    if (yesterCount > 0) {
      pct_vs_yesterday[key] = Number((((last24 - yesterCount) / yesterCount) * 100).toFixed(1));
    } else {
      pct_vs_yesterday[key] = last24 > 0 ? 100 : 0;
    }
  }

  // Database sizes (PostgreSQL): per-table and total
  const sizesRes = await query(
    `SELECT
       relname AS table_name,
       pg_total_relation_size(relid) AS size_bytes
     FROM pg_catalog.pg_statio_user_tables
     WHERE schemaname = 'public'
     ORDER BY size_bytes DESC`,
    []
  );
  const db_sizes = (sizesRes.rows || []).map((r) => ({
    table: r.table_name,
    size_bytes: Number(r.size_bytes),
    size_pretty: formatBytes(Number(r.size_bytes)),
  }));
  const totalDbRes = await query('SELECT pg_database_size(current_database()) AS size', []);
  const total_db_bytes = Number(totalDbRes.rows[0]?.size ?? 0);

  return {
    totals,
    last_24h,
    yesterday,
    pct_vs_yesterday,
    db_sizes,
    total_db_bytes,
    total_db_pretty: formatBytes(total_db_bytes),
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

module.exports = { getStatistics };
