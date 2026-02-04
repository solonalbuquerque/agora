#!/usr/bin/env node
'use strict';

/**
 * Generate headers for Issuer-signed request (POST /issuer/credit).
 * Payload: issuerId + "\n" + timestamp + "\n" + method + "\n" + path + "\n" + bodyHash
 * path = canonical path (no query string).
 *
 * Usage: node scripts/sign-issuer-request.js <issuerId> <secret> <bodyJson>
 *
 * Example:
 *   node scripts/sign-issuer-request.js <uuid> <secret> '{"agent_id":"...","coin":"AGOTEST","amount_cents":100,"external_ref":"ref-1"}'
 */

const { buildSigningPayload, sha256Hex, sign } = require('../src/lib/auth');

function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node scripts/sign-issuer-request.js <issuerId> <secret> <bodyJson>');
    process.exit(1);
  }
  const issuerId = args[0];
  const secret = args[1];
  const body = args.slice(2).join(' ');
  const method = 'POST';
  const path = '/issuer/credit';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = sha256Hex(body);
  const payload = buildSigningPayload(issuerId, timestamp, method, path, bodyHash);
  const signature = sign(secret, payload);

  console.log('Headers for POST /issuer/credit:\n');
  console.log('X-Issuer-Id:', issuerId);
  console.log('X-Issuer-Timestamp:', timestamp);
  console.log('X-Issuer-Signature:', signature);
  console.log('\nBody (use exactly):', body);
}

main();
