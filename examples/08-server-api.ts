#!/usr/bin/env node
/**
 * Example 8 — Server REST + SSE
 *
 * Demonstrates how a third-party process can talk to the running
 * Personal-Assistant server (port 4317) over its REST + SSE API.
 *
 *   1. Start the server in another terminal:
 *        npm run dev:server
 *   2. Run this script:
 *        npx tsx examples/08-server-api.ts
 */

const BASE = process.env.PA_BASE ?? 'http://localhost:4317';

async function rest(path: string, init?: RequestInit) {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function sse(path: string, body: any, onEvent: (e: string, d: any) => void) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) throw new Error(`${path} → ${r.status}`);

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const eventMatch = frame.match(/^event: (.*)$/m);
      const dataMatch = frame.match(/^data: (.*)$/m);
      if (eventMatch && dataMatch) {
        try {
          onEvent(eventMatch[1], JSON.parse(dataMatch[1]));
        } catch {
          onEvent(eventMatch[1], dataMatch[1]);
        }
      }
    }
  }
}

async function main() {
  console.log('🚀 Example 8 — Server REST + SSE\n');
  console.log(`Base URL: ${BASE}\n`);

  // 1) Health
  const health = await rest('/api/health');
  console.log(`Health:   ${JSON.stringify(health)}`);

  // 2) Dashboard
  const dash = await rest('/api/dashboard');
  console.log(
    `Dashboard: sessions=${dash.chatSessions} memory=${dash.memoryCount} providers=${dash.providersConfigured}/${dash.providersTotal}`,
  );

  // 3) List tools
  const tools = await rest('/api/tools');
  console.log(`Tools:     ${tools.length} registered`);

  // 4) Execute a tool via REST
  const result = await rest('/api/tools/execute', {
    method: 'POST',
    body: JSON.stringify({ tool: 'shell', args: { command: 'echo "hello from $PA server"' } }),
  });
  console.log(`Shell:     "${(result.output as string).trim()}"`);

  // 5) Stream a chat
  console.log('\n─── Stream chat ──────────────────────────────');
  await sse(
    '/api/chat/stream',
    { message: 'What is 2+2? Answer in one word.' },
    (event, data) => {
      if (event === 'chunk') process.stdout.write(data.content ?? '');
      else if (event === 'error') console.error(`\n[error] ${data.message}`);
      else if (event === 'assistant-end') console.log('\n[end]');
    },
  );
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
