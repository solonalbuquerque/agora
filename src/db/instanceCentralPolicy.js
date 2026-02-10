'use strict';

const { query } = require('./index');

/**
 * Upsert Central policy cache for an instance.
 * @param {string} instanceId
 * @param {{ trust_level?: string, visibility_status?: string, policy: object }} data
 */
async function upsert(instanceId, data) {
  const policyJson = JSON.stringify(data.policy || {});
  await query(
    `INSERT INTO instance_central_policy (instance_id, trust_level, visibility_status, policy_json, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (instance_id) DO UPDATE SET
       trust_level = EXCLUDED.trust_level,
       visibility_status = EXCLUDED.visibility_status,
       policy_json = EXCLUDED.policy_json,
       updated_at = now()`,
    [
      instanceId,
      data.trust_level || null,
      data.visibility_status || null,
      policyJson,
    ]
  );
}

/**
 * Get cached Central policy for an instance.
 * @param {string} instanceId
 * @returns {Promise<{ trust_level: string, visibility_status: string, policy: object, updated_at: Date } | null>}
 */
async function get(instanceId) {
  const res = await query(
    `SELECT trust_level, visibility_status, policy_json, updated_at
     FROM instance_central_policy WHERE instance_id = $1`,
    [instanceId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    trust_level: row.trust_level || 'unverified',
    visibility_status: row.visibility_status || 'unlisted',
    policy: row.policy_json && typeof row.policy_json === 'object' ? row.policy_json : (typeof row.policy_json === 'string' ? JSON.parse(row.policy_json || '{}') : {}),
    updated_at: row.updated_at,
  };
}

module.exports = { upsert, get };
