'use strict';

const { query } = require('./index');

async function get(key) {
  const res = await query('SELECT value FROM staff_settings WHERE key = $1', [key]);
  return res.rows[0] ? res.rows[0].value : null;
}

async function set(key, value) {
  await query(
    'INSERT INTO staff_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, value]
  );
}

module.exports = { get, set };
