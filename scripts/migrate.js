'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const migrationsDir = path.join(__dirname, '..', 'migrations');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://agora:agora@localhost:5432/agora' });
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log('Running', file);
    await pool.query(sql);
  }
  await pool.end();
  console.log('Migrations done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
