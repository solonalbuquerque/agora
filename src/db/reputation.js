'use strict';

const { query } = require('./index');

async function getAgentReputation(agentId) {
  const res = await query(
    `SELECT total_calls, success_calls, success_rate_pct AS success_rate, avg_latency_ms AS avg_latency
     FROM agent_reputation WHERE agent_id = $1`,
    [agentId]
  );
  const row = res.rows[0];
  if (!row) {
    return { total_calls: 0, success_calls: 0, success_rate: 0, avg_latency: null };
  }
  return {
    total_calls: Number(row.total_calls),
    success_calls: Number(row.success_calls),
    success_rate: Number(row.success_rate),
    avg_latency: row.avg_latency != null ? Number(row.avg_latency) : null,
  };
}

async function getServiceReputation(serviceId) {
  const res = await query(
    `SELECT total_calls, success_calls, success_rate_pct AS success_rate, avg_latency_ms AS avg_latency
     FROM service_reputation WHERE service_id = $1`,
    [serviceId]
  );
  const row = res.rows[0];
  if (!row) {
    return { total_calls: 0, success_calls: 0, success_rate: 0, avg_latency: null };
  }
  return {
    total_calls: Number(row.total_calls),
    success_calls: Number(row.success_calls),
    success_rate: Number(row.success_rate),
    avg_latency: row.avg_latency != null ? Number(row.avg_latency) : null,
  };
}

module.exports = {
  getAgentReputation,
  getServiceReputation,
};
