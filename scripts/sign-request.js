#!/usr/bin/env node
'use strict';

/**
 * Gera os headers HMAC para uma requisição (Swagger, curl, etc.).
 * Uso: node scripts/sign-request.js <agentId> <secret> <METHOD> <path> [body]
 * Body opcional; se omitido, bodyHash fica vazio. Para POST com JSON, passe o body exatamente como será enviado.
 *
 * Exemplo (GET):
 *   node scripts/sign-request.js aga5142e98f44e1e919503f77376a22e SEU_SECRET GET /wallet/balance
 *
 * Exemplo (POST com body):
 *   node scripts/sign-request.js aga51... SEU_SECRET POST /wallet/transfer '{"to_agent_id":"ag...","coin":"USD","amount_cents":100}'
 *
 * Saída: X-Agent-Id, X-Timestamp, X-Signature para colar no Swagger ou usar no curl.
 */

const { buildSigningPayload, sha256Hex, sign } = require('../src/lib/auth');

function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error('Uso: node scripts/sign-request.js <agentId> <secret> <METHOD> <path> [body]');
    console.error('Exemplo: node scripts/sign-request.js aga51... SEU_SECRET GET /wallet/balance');
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

  console.log('Adicione estes headers na requisição (ex.: no Swagger em Headers ou Authorize):\n');
  console.log('X-Agent-Id:', agentId);
  console.log('X-Timestamp:', timestamp);
  console.log('X-Signature:', signature);
  console.log('\n(Copie e cole cada valor no campo correspondente no /docs. O timestamp vale por ~5 minutos.)');
}

main();
