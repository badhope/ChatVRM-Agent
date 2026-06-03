#!/usr/bin/env node
import { createApp } from './app.js';

const requestedPort = parseInt(process.env.PORT ?? '3000', 10);
const PORT = Number.isFinite(requestedPort) && requestedPort > 0 && requestedPort < 65536
  ? requestedPort
  : 3000;
const HOST = process.env.HOST ?? '0.0.0.0';

const app = createApp();
app.listen(PORT, HOST, () => {
  process.stdout.write(`\n🚀 Personal-Assistant Web Server\n`);
  process.stdout.write(`   listening on http://${HOST}:${PORT}\n\n`);
});
