'use strict';

const config = require('../../config');
const { incrRateLimit } = require('../redis');
const { rateLimit } = require('../errors');
const { securityLog } = require('./securityLog');

const WINDOW = config.rateLimitWindowSeconds;
const MAX_REQUESTS = config.rateLimitMaxRequests;
const PREFIX = 'rl:';

/**
 * Build rate limit key from request (agent_id, issuer_id, or IP).
 * @param {object} request - Fastify request
 * @param {string} scope - 'agent' | 'issuer' | 'ip' | 'global'
 * @returns {string} key segment
 */
function getRateLimitKey(request, scope) {
  if (scope === 'agent' && request.agentId) return `agent:${request.agentId}`;
  if (scope === 'issuer' && request.issuerId) return `issuer:${request.issuerId}`;
  const ip = request.ip || request.headers['x-forwarded-for'] || request.connection?.remoteAddress || 'unknown';
  const ipNorm = (typeof ip === 'string' ? ip.split(',')[0].trim() : 'unknown');
  if (scope === 'ip') return `ip:${ipNorm}`;
  return `ip:${ipNorm}`;
}

/**
 * Apply rate limit headers to reply.
 */
function setRateLimitHeaders(reply, limit, remaining, resetAt) {
  reply.header('X-RateLimit-Limit', String(limit));
  reply.header('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  reply.header('X-RateLimit-Reset', String(resetAt));
}

/**
 * PreHandler that rate limits by a single scope (e.g. IP for register, agent for execute).
 * Uses Redis with in-memory fallback. Returns 429 with standard headers when over limit.
 * @param {object} opts - { scope: 'ip' | 'agent' | 'issuer', keyPrefix?: string }
 */
function createRateLimitPreHandler(opts = {}) {
  const scope = opts.scope || 'ip';
  const keyPrefix = opts.keyPrefix || '';

  return async function rateLimitPreHandler(request, reply) {
    const keySegment = getRateLimitKey(request, scope);
    const key = PREFIX + (keyPrefix ? keyPrefix + ':' : '') + keySegment;
    const { current, over, limit, resetAt } = await incrRateLimit(key, WINDOW, MAX_REQUESTS);
    const remaining = Math.max(0, limit - current);
    setRateLimitHeaders(reply, limit, remaining, resetAt ?? Math.floor(Date.now() / 1000) + WINDOW);
    if (over) {
      securityLog(request, 'rate_limit_triggered', { scope, keySegment });
      return rateLimit(reply, 'Too many requests');
    }
  };
}

/**
 * PreHandler that rate limits by both IP and (when present) agent or issuer.
 * Applied to endpoints that can be identified by IP only before auth (e.g. /agents/register) or by agent/issuer after auth.
 */
function createDualRateLimitPreHandler(opts = {}) {
  const keyPrefix = opts.keyPrefix || '';

  return async function dualRateLimitPreHandler(request, reply) {
    const ipSegment = getRateLimitKey(request, 'ip');
    const ipKey = PREFIX + (keyPrefix ? keyPrefix + ':' : '') + ipSegment;
    const agentSegment = request.agentId ? `agent:${request.agentId}` : null;
    const issuerSegment = request.issuerId ? `issuer:${request.issuerId}` : null;
    const keys = [ipKey];
    if (agentSegment) keys.push(PREFIX + (keyPrefix ? keyPrefix + ':' : '') + agentSegment);
    if (issuerSegment) keys.push(PREFIX + (keyPrefix ? keyPrefix + ':' : '') + issuerSegment);

    const results = await Promise.all(
      keys.map((k) => incrRateLimit(k, WINDOW, MAX_REQUESTS))
    );
    const over = results.some((r) => r.over);
    const primary = results[0];
    const limit = primary.limit ?? MAX_REQUESTS;
    const resetAt = primary.resetAt ?? Math.floor(Date.now() / 1000) + WINDOW;
    const currentMax = Math.max(...results.map((r) => r.current));
    const remaining = Math.max(0, limit - currentMax);
    setRateLimitHeaders(reply, limit, remaining, resetAt);
    if (over) {
      securityLog(request, 'rate_limit_triggered', { scope: keyPrefix || 'dual' });
      return rateLimit(reply, 'Too many requests');
    }
  };
}

module.exports = {
  createRateLimitPreHandler,
  createDualRateLimitPreHandler,
  setRateLimitHeaders,
  getRateLimitKey,
  WINDOW,
  MAX_REQUESTS,
};
