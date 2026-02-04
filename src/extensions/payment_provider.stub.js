'use strict';

/**
 * Payment provider extension — STUB ONLY.
 * Future: integrate real payment methods (PIX, card, crypto).
 * Not implemented in core. Implementations can be provided by managed services or plugins.
 */

/**
 * Charge an agent for an amount in the given currency.
 * @param {string} agentId - Agent UUID
 * @param {number} amountCents - Amount in cents
 * @param {string} currency - Currency code (e.g. 'USD', 'BRL')
 * @returns {Promise<{ transactionId: string }>} - Transaction reference
 */
async function charge(agentId, amountCents, currency) {
  // TODO: Implement when real payments are added (PIX, card, crypto).
  throw new Error('Payment provider not implemented in core. Use a managed service or plugin.');
}

/**
 * Refund a previous charge.
 * @param {string} transactionId - Transaction ID from charge()
 * @returns {Promise<void>}
 */
async function refund(transactionId) {
  // TODO: Implement when real payments are added.
  throw new Error('Payment provider not implemented in core. Use a managed service or plugin.');
}

module.exports = {
  charge,
  refund,
};
