'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a UUID with a fixed 2-character prefix (e.g. "ser").
 * Use for entities whose API contract does not require format: 'uuid'.
 */
function prefixedId(prefix) {
  const id = uuidv4().replace(/-/g, '');
  return prefix + id.slice(2);
}

/**
 * Agent ID: standard UUID v4, required by API schema (format: 'uuid').
 */
function agentId() {
  return uuidv4();
}

function serviceId() {
  return prefixedId('ser');
}

module.exports = {
  prefixedId,
  agentId,
  serviceId,
};
