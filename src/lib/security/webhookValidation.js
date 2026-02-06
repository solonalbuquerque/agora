'use strict';

const dns = require('dns').promises;
const url = require('url');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

const PRIVATE_IPV4_RANGES = [
  [/^10\./, 8],           // 10.0.0.0/8
  [/^172\.(1[6-9]|2[0-9]|3[0-1])\./, 12], // 172.16.0.0/12
  [/^192\.168\./, 16],    // 192.168.0.0/16
  [/^169\.254\./, 16],    // 169.254.0.0/16 link-local
  [/^127\./, 8],          // 127.0.0.0/8 loopback
  [/^0\./, 8],            // 0.0.0.0
];

function isPrivateIPv4(addr) {
  if (!addr || typeof addr !== 'string') return true;
  const parts = addr.split('.');
  if (parts.length !== 4) return true;
  for (const [pattern] of PRIVATE_IPV4_RANGES) {
    if (pattern.test(addr)) return true;
  }
  return false;
}

function isPrivateIPv6(addr) {
  if (!addr || typeof addr !== 'string') return true;
  const norm = addr.toLowerCase().replace(/\[|\]/g, '');
  if (norm === '::1') return true;
  if (norm === '::') return true;
  if (norm.startsWith('fe80:')) return true; // link-local
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // ULA
  return false;
}

/**
 * Validate webhook URL for SSRF: only http/https, no private/local IPs, DNS rebinding check.
 * @param {string} rawUrl - Webhook URL
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function validateWebhookUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { ok: false, reason: 'URL required' };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return { ok: false, reason: 'Invalid URL' };
  }
  const protocol = (parsed.protocol || '').toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https are allowed' };
  }
  const hostname = (parsed.hostname || '').toLowerCase();
  if (!hostname) {
    return { ok: false, reason: 'Missing hostname' };
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: 'Blocked hostname' };
  }
  if (hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1') {
    return { ok: false, reason: 'Blocked hostname (loopback)' };
  }
  try {
    const resolved = await dns.resolve(hostname, 'A').catch(() => []);
    const resolved6 = await dns.resolve(hostname, 'AAAA').catch(() => []);
    const all = [...(resolved || []), ...(resolved6 || [])];
    for (const ip of all) {
      if (isPrivateIPv4(ip) || isPrivateIPv6(ip)) {
        return { ok: false, reason: 'Resolved to private or loopback IP (DNS rebinding)' };
      }
    }
    if (all.length === 0) {
      return { ok: false, reason: 'Could not resolve hostname' };
    }
  } catch (err) {
    return { ok: false, reason: 'DNS resolution failed' };
  }
  return { ok: true };
}

module.exports = {
  validateWebhookUrl,
  isPrivateIPv4,
  isPrivateIPv6,
};
