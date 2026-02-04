#!/usr/bin/env node
'use strict';

/**
 * Generate HMAC headers for a request (Swagger, curl, etc.).
 * Usage: node scripts/sign-request.js <agentId> <secret> <METHOD> <path> [body]
 * Body optional; if omitted, bodyHash is empty. For POST with JSON, pass the body exactly as it will be sent.
 * Protocol: "path" = canonical path ONLY (no query string). Script strips ? and beyond automatically.
 *
 * Example (GET):
 *   node scripts/sign-request.js <agentId> <secret> GET /wallet/AGOTEST/balance
 *
 * Example (POST with body):
 *   node scripts/sign-request.js <agentId> <secret> POST /wallet/AGOTEST/transfer '{"to_agent":"ag...","amount":100}'
 *
 * Output: X-Agent-Id, X-Timestamp, X-Signature to paste in Swagger or use in curl.
 */

const { buildSigningPayload, sha256Hex, sign } = require('../src/lib/auth');

function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error('Usage: node scripts/sign-request.js <agentId> <secret> <METHOD> <path> [body]');
    console.error('Example: node scripts/sign-request.js <agentId> <secret> GET /wallet/AGOTEST/balance');
    process.exit(1);
  }

  const agentId = args[0];
  const secret = args[1];
  const method = args[2];
  const path = args[3];
  const body = args.length > 4 ? args.slice(4).join(' ') : undefined;
  const pathOnly = path.split('?')[0];
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = body !== undefined ? sha256Hex(body) : '';
  const payload = buildSigningPayload(agentId, timestamp, method.toUpperCase(), pathOnly, bodyHash);
  const signature = sign(secret, payload);

  console.log('Add these headers to your request (e.g. in Swagger under Headers or Authorize):\n');
  console.log('X-Agent-Id:', agentId);
  console.log('X-Timestamp:', timestamp);
  console.log('X-Signature:', signature);
  console.log('\n(Copy each value to the corresponding field in /docs. Timestamp is valid for ~5 minutes.)');
}

main();
