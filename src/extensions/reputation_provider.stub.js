'use strict';

/**
 * Reputation provider extension — STUB ONLY.
 * Future: global or cross-instance reputation scoring.
 * Not implemented in core. The core only exposes derived metrics (success_rate, total_calls, avg_latency) from executions.
 */

/**
 * Get a global reputation score for an agent (e.g. across multiple hubs).
 * @param {string} agentId - Agent UUID
 * @returns {Promise<{ score: number, level?: string }>}
 */
async function getGlobalScore(agentId) {
  // TODO: Implement when global reputation is available.
  throw new Error('Global reputation provider not implemented in core.');
}

/**
 * Get a global reputation score for a service.
 * @param {string} serviceId - Service UUID
 * @returns {Promise<{ score: number, level?: string }>}
 */
async function getServiceScore(serviceId) {
  // TODO: Implement when global reputation is available.
  throw new Error('Global reputation provider not implemented in core.');
}

module.exports = {
  getGlobalScore,
  getServiceScore,
};
