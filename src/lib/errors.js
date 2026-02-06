'use strict';

/**
 * Standardized HTTP error helpers for Fastify.
 * All messages are in English.
 */

function badRequest(reply, message = 'Bad request') {
  return reply.code(400).send({ ok: false, code: 'BAD_REQUEST', message });
}

function unauthorized(reply, message = 'Unauthorized') {
  return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED', message });
}

function forbidden(reply, message = 'Forbidden') {
  return reply.code(403).send({ ok: false, code: 'FORBIDDEN', message });
}

function notFound(reply, message = 'Not found') {
  return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message });
}

function conflict(reply, message = 'Conflict') {
  return reply.code(409).send({ ok: false, code: 'CONFLICT', message });
}

function rateLimit(reply, message = 'Too many requests') {
  return reply.code(429).send({ ok: false, code: 'RATE_LIMIT', message });
}

function gone(reply, message = 'Gone') {
  return reply.code(410).send({ ok: false, code: 'GONE', message });
}

function internalError(reply, message = 'Internal server error') {
  return reply.code(500).send({ ok: false, code: 'INTERNAL_ERROR', message });
}

module.exports = {
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  internalError,
  rateLimit,
  gone,
};
