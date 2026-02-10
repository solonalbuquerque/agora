'use strict';

const { query } = require('./index');
const { serviceId } = require('../lib/ids');

/** Slug validation: [a-z0-9][a-z0-9-]* max 64 chars */
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;
const SLUG_MAX_LEN = 64;

function normalizeSlug(slug) {
  if (slug == null || typeof slug !== 'string') return null;
  const s = slug.trim().toLowerCase();
  return s === '' ? null : s;
}

function isValidSlug(slug) {
  const s = normalizeSlug(slug);
  if (!s) return true; // null/empty is valid (no slug)
  return s.length <= SLUG_MAX_LEN && SLUG_REGEX.test(s);
}

async function create(data) {
  const id = serviceId();
  const {
    owner_agent_id,
    name,
    description = '',
    webhook_url,
    input_schema = null,
    output_schema = null,
    price_cents = 0,
    coin = 'AGOTEST',
    export: exportFlag = false,
    slug: slugInput = null,
  } = data;
  const slug = normalizeSlug(slugInput);
  const visibility = exportFlag ? 'exported' : 'local';
  const exportStatus = exportFlag ? 'active' : 'inactive';
  await query(
    `INSERT INTO services (id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents, coin, status, visibility, export_status, exported_at, slug)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11, $12, $13)`,
    [
      id,
      owner_agent_id,
      name,
      description,
      webhook_url,
      input_schema ? JSON.stringify(input_schema) : null,
      output_schema ? JSON.stringify(output_schema) : null,
      price_cents,
      (coin || 'AGOTEST').toString().slice(0, 16),
      visibility,
      exportStatus,
      exportFlag ? new Date() : null,
      slug || null,
    ]
  );
  return getById(id);
}

async function getById(id) {
  const res = await query(
    `SELECT id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents, coin, status, slug, created_at
     FROM services WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function getBySlug(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const res = await query(
    `SELECT id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents, coin, status, slug, created_at
     FROM services WHERE slug = $1`,
    [s]
  );
  return res.rows[0] || null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getByIdOrSlug(idOrSlug) {
  if (!idOrSlug || typeof idOrSlug !== 'string') return null;
  const s = idOrSlug.trim();
  if (UUID_REGEX.test(s)) return getById(s);
  return getBySlug(s);
}

async function list(filters = {}) {
  let { status, owner_agent_id, coin, q, limit = 50, offset = 0 } = filters;
  if (status === undefined || status === null) {
    status = 'active';
  }
  let whereSql = ' WHERE 1=1';
  const params = [];
  let i = 1;
  if (status) {
    params.push(status);
    whereSql += ` AND status = $${i++}`;
  }
  if (owner_agent_id) {
    params.push(owner_agent_id);
    whereSql += ` AND owner_agent_id = $${i++}`;
  }
  if (coin) {
    params.push(coin);
    whereSql += ` AND coin = $${i++}`;
  }
  if (q != null && q !== '') {
    params.push(q);
    whereSql += ` AND (position(lower($${i}) in lower(name)) > 0 OR position(lower($${i}) in lower(COALESCE(description, ''))) > 0 OR (input_schema IS NOT NULL AND position(lower($${i}) in lower(input_schema::text)) > 0))`;
    i++;
  }
  
  // Count total
  const countRes = await query(`SELECT COUNT(*) as total FROM services${whereSql}`, params);
  const total = parseInt(countRes.rows[0]?.total || 0, 10);
  
  if (filters.visibility) {
    params.push(filters.visibility);
    whereSql += ` AND visibility = $${i++}`;
  }
  if (filters.export_status) {
    params.push(filters.export_status);
    whereSql += ` AND export_status = $${i++}`;
  }

  // Get rows with pagination
  const sql = `SELECT id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents, coin, status,
               visibility, export_status, exported_at, suspended_at, export_reason, slug, created_at
               FROM services${whereSql} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`;
  params.push(Number(limit) || 50, Number(offset) || 0);
  const res = await query(sql, params);
  return { rows: res.rows, total };
}

async function update(id, data) {
  const allowed = ['name', 'description', 'webhook_url', 'input_schema', 'output_schema', 'price_cents', 'coin', 'status', 'visibility', 'export_status', 'exported_at', 'suspended_at', 'export_reason', 'slug'];
  const updates = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (!(key in data)) continue;
    let val = data[key];
    if (key === 'input_schema' || key === 'output_schema') {
      val = val != null ? JSON.stringify(val) : null;
    }
    if (key === 'status' && val != null) {
      if (!['active', 'paused', 'removed'].includes(val)) continue;
    }
    if (key === 'coin' && val != null) val = String(val).slice(0, 16);
    if (key === 'exported_at' || key === 'suspended_at') {
      // leave as provided (Date or null)
    }
    if (key === 'slug') val = normalizeSlug(val);
    updates.push(`${key} = $${i++}`);
    values.push(val);
  }
  if (updates.length === 0) return getById(id);
  values.push(id);
  const sql = `UPDATE services SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, owner_agent_id, name, description, webhook_url, input_schema, output_schema, price_cents, coin, status, visibility, export_status, exported_at, suspended_at, export_reason, slug, created_at`;
  const res = await query(sql, values);
  return res.rows[0] || null;
}

async function setExport(id, exportFlag) {
  if (exportFlag) {
    await query(
      `UPDATE services SET visibility = 'exported', export_status = 'active', exported_at = NOW(), suspended_at = NULL, export_reason = NULL WHERE id = $1`,
      [id]
    );
  } else {
    await query(
      `UPDATE services SET visibility = 'local', export_status = 'inactive', suspended_at = NULL, export_reason = NULL WHERE id = $1`,
      [id]
    );
  }
  return getById(id);
}

async function suspendAllExported(reason) {
  const res = await query(
    `UPDATE services SET export_status = 'suspended', suspended_at = NOW(), export_reason = $1 WHERE visibility = 'exported' AND export_status = 'active' RETURNING id`,
    [reason || 'INSTANCE_NOT_COMPLIANT']
  );
  return res.rows.length;
}

async function resumeExport(id) {
  await query(
    `UPDATE services SET export_status = 'active', suspended_at = NULL, export_reason = NULL WHERE id = $1 AND visibility = 'exported'`,
    [id]
  );
  return getById(id);
}

module.exports = {
  create,
  getById,
  getBySlug,
  getByIdOrSlug,
  list,
  update,
  setExport,
  suspendAllExported,
  resumeExport,
  isValidSlug,
  normalizeSlug,
};
