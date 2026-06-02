#!/usr/bin/env node
import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = createApp();
app.listen(PORT, HOST, () => {
  process.stdout.write(`\n🚀 Personal-Assistant Web Server\n`);
  process.stdout.write(`   listening on http://${HOST}:${PORT}\n\n`);
});
