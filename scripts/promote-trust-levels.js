#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { runPromotion } = require('../src/jobs/promoteTrustLevels');

runPromotion()
  .then(({ promoted, checked }) => {
    console.log(`Checked ${checked} agents, promoted ${promoted}.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Promotion job failed:', err);
    process.exit(1);
  });
