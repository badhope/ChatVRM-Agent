#!/usr/bin/env node
import { createApp } from './app.js';
// H3 (W19): print the auth-mode banner exactly once at boot, *before*
// the server starts accepting traffic. Without this, a process
// started without `PA_API_TOKEN` would only emit the "auth is
// unset" warning the first time a request hits an auth middleware
// (which on a quiet network might be never).
import { authStartupBanner } from './middleware/auth.js';

authStartupBanner();

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
