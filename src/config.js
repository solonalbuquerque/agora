'use strict';

require('dotenv').config();

const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://agora:agora@localhost:5432/agora',
  redisUrl: process.env.REDIS_URL || '',
  adminToken: process.env.ADMIN_TOKEN || '',
};

module.exports = config;
