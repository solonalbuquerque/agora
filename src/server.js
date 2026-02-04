'use strict';

const config = require('./config');
const app = require('./app');

async function start() {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`AGORA Core listening on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((sig) => {
  process.on(sig, async () => {
    app.log.info(`Received ${sig}, closing server`);
    await app.close();
    process.exit(0);
  });
});

start();
