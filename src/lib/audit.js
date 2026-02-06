'use strict';

const auditDb = require('../db/audit');

/**
 * Record an audit event (human/admin/issuer/system action).
 * event_type: e.g. ADMIN_MINT, ISSUER_CREDIT, AGENT_BAN, INSTANCE_ACTIVATE, SERVICE_RESUMED.
 * actor_type: human | admin | issuer | system
 * Optional: actor_id, target_type (agent|wallet|service|instance|execution), target_id, metadata, request_id.
 */
async function recordAuditEvent(event) {
  try {
    await auditDb.insert(event);
  } catch (err) {
    try {
      const logger = require('./logger');
      logger.log('error', 'audit_insert_failed', { event_type: event.event_type, err: err.message });
    } catch (_) {
      console.error('[audit] insert failed', event.event_type, err.message);
    }
  }
}

module.exports = { recordAuditEvent };
