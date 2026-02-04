'use strict';

/**
 * Identity verification extension — STUB ONLY.
 * Future: KYC / strong verification (e.g. document verification, attestations).
 * Not implemented in core. Core only provides pseudonymous agent identity.
 */

/**
 * Verify an agent's identity with optional payload (e.g. document hash, attestation).
 * @param {string} agentId - Agent UUID
 * @param {object} payload - Verification payload (format TBD)
 * @returns {Promise<{ verified: boolean, level?: string }>}
 */
async function verify(agentId, payload) {
  // TODO: Implement when KYC / strong verification is required.
  throw new Error('Identity verification not implemented in core. Use a managed service or plugin.');
}

module.exports = {
  verify,
};
