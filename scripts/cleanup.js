#!/usr/bin/env node
'use strict';

/**
 * B2.7 Retention cleanup: remove old executions and audit_events based on ENV.
 * - EXECUTION_RETENTION_DAYS: delete executions older than N days (0 = skip).
 * - AUDIT_RETENTION_DAYS: delete audit_events older than N days (0 = skip).
 * Run via cron or manually. Does not remove ledger or wallets; keeps minimal compliance data.
 */

require('dotenv').config();
const config = require('../src/config');
const { query } = require('../src/db/index');

async function main() {
  const executionDays = config.executionRetentionDays || 0;
  const auditDays = config.auditRetentionDays || 0;

  if (executionDays <= 0 && auditDays <= 0) {
    console.log('No retention configured (EXECUTION_RETENTION_DAYS and AUDIT_RETENTION_DAYS are 0 or unset). Exiting.');
    process.exit(0);
  }

  let deletedExecutions = 0;
  let deletedAudit = 0;

  if (executionDays > 0) {
    const r = await query(
      `DELETE FROM executions WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [executionDays]
    );
    deletedExecutions = r.rowCount || 0;
    console.log(`Deleted ${deletedExecutions} executions older than ${executionDays} days.`);
  }

  if (auditDays > 0) {
    const r = await query(
      `DELETE FROM audit_events WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [auditDays]
    );
    deletedAudit = r.rowCount || 0;
    console.log(`Deleted ${deletedAudit} audit_events older than ${auditDays} days.`);
  }

  console.log('Cleanup done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
