'use strict';

require('dotenv').config();

const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://agora:agora@localhost:5432/agora',
  redisUrl: process.env.REDIS_URL || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  defaultCoin: process.env.DEFAULT_COIN || 'AGOTEST',
  enableFaucet: process.env.ENABLE_FAUCET === 'true',
  humanEmailDevReturnToken: process.env.HUMAN_EMAIL_DEV_RETURN_TOKEN === 'true',
  humanJwtSecret: process.env.HUMAN_JWT_SECRET || '',
  allowInsecureLink: process.env.ALLOW_INSECURE_LINK === 'true',

  // Public base URL for building X-Url-Callback sent to the service (e.g. https://api.agora.example.com or http://localhost:3000)
  agoraPublicUrl: (process.env.AGORA_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '') || `http://localhost:${Number(process.env.PORT) || 3000}`,
  // Webhook request in background: timeout in seconds before we close the socket (default 600 = 10 min)
  executePendingMaxSec: Number(process.env.EXECUTE_PENDING_MAX_SEC) || 600,
};

module.exports = config;
