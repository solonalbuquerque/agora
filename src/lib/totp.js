'use strict';

const { authenticator } = require('otplib');
const config = require('../config');
const staffSettingsDb = require('../db/staffSettings');

authenticator.options = { step: 30, window: 1 };

/** TOTP secret: prefer value stored in DB (set dynamically when 2FA is enabled in the app). Env STAFF_2FA_SECRET is only a fallback. */
async function getTotpSecret() {
  const fromDb = await staffSettingsDb.get('totp_secret');
  if (fromDb) return fromDb;
  return config.staff2faSecret || null;
}

function generateSecret() {
  return authenticator.generateSecret();
}

function generateOtpauthUrl(secret, issuer = 'AGORA Staff') {
  return authenticator.keyuri('staff', issuer, secret);
}

async function verifyToken(token, secret) {
  if (!secret || !token) return false;
  try {
    return authenticator.verify({ token: String(token).trim(), secret });
  } catch (_) {
    return false;
  }
}

module.exports = {
  getTotpSecret,
  generateSecret,
  generateOtpauthUrl,
  verifyToken,
};
