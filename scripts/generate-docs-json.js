#!/usr/bin/env node
'use strict';

/**
 * Generates the API documentation JSON files and writes them to docs/.
 * Requires the app to start (database must be available for full root.json).
 *
 * Output files:
 *   docs/root.json      — GET / response (discovery + system info)
 *   docs/swagger.json   — OpenAPI 3 spec (same as GET /swagger.json)
 *   docs/doc-ia.json   — GET /doc-ia response (documentation for AI)
 */

const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');

async function main() {
  const app = require('../src/app.js');

  await app.ready();

  const [resRoot, resSwagger, resDocIa] = await Promise.all([
    app.inject({ method: 'GET', url: '/' }),
    app.inject({ method: 'GET', url: '/swagger.json' }),
    app.inject({ method: 'GET', url: '/doc-ia' }),
  ]);

  await app.close();

  if (resRoot.statusCode !== 200) {
    throw new Error(`GET / returned ${resRoot.statusCode}`);
  }
  if (resSwagger.statusCode !== 200) {
    throw new Error(`GET /swagger.json returned ${resSwagger.statusCode}`);
  }
  if (resDocIa.statusCode !== 200) {
    throw new Error(`GET /doc-ia returned ${resDocIa.statusCode}`);
  }

  const root = JSON.parse(resRoot.payload);
  const swagger = JSON.parse(resSwagger.payload);
  const docIa = JSON.parse(resDocIa.payload);

  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(docsDir, 'root.json'),
    JSON.stringify(root, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(docsDir, 'swagger.json'),
    JSON.stringify(swagger, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(docsDir, 'doc-ia.json'),
    JSON.stringify(docIa, null, 2),
    'utf8'
  );

  console.log('Generated docs/root.json, docs/swagger.json, docs/doc-ia.json');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to generate docs JSON:', err.message);
  console.error('Ensure the database is running (e.g. npm run migrate) and no other process is using it.');
  process.exit(1);
});
