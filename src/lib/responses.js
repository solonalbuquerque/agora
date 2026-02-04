'use strict';

/**
 * Standardized success responses. Never include secrets in payloads or logs.
 */

function success(reply, data) {
  return reply.code(200).send({ ok: true, data });
}

function created(reply, data) {
  return reply.code(201).send({ ok: true, data });
}

function list(reply, data, meta = {}) {
  return reply.code(200).send({ ok: true, data, meta });
}

module.exports = {
  success,
  created,
  list,
};
