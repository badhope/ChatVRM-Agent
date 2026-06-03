/**
 * Talk to the running server (port 4317) over its REST + SSE API.
 * Demonstrates how a third-party process can integrate with
 * Personal-Assistant without depending on the npm package.
 *
 *   npm run dev:server     # in another terminal
 *   npx tsx examples/08-server-api.ts
 */

const BASE = process.env.PA_BASE ?? 'http://localhost:4317';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

async function sse(path: string, body: unknown, onEvent: (event: string, data: any) => void) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) throw new Error(`${path} → ${r.status}`);

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = frame.match(/^event: (.*)$/m)?.[1];
      const data = frame.match(/^data: (.*)$/m)?.[1];
      if (event && data) {
        try { onEvent(event, JSON.parse(data)); } catch { onEvent(event, data); }
      }
    }
  }
}

const health = await get<{ status: string; uptime: number }>('/api/health');
console.log(`health:   ${health.status}  uptime=${health.uptime}s`);

const dash = await get<any>('/api/dashboard');
console.log(`dash:     ${dash.chatSessions} sessions, ${dash.memoryCount} memories, ${dash.providersConfigured}/${dash.providersTotal} providers`);

const tools = await get<any[]>('/api/tools');
console.log(`tools:    ${tools.length} registered`);

const shell = await post<{ output: string }>('/api/tools/execute', {
  tool: 'shell',
  args: { command: 'echo "hello from the server"' },
});
console.log(`shell:    "${shell.output.trim()}"`);

console.log('\nstreaming chat:');
await sse('/api/chat/stream', { message: 'What is 2+2? Answer in one word.' }, (event, data) => {
  if (event === 'chunk') process.stdout.write(data.content ?? '');
  else if (event === 'error') console.error(`\n[error] ${data.message}`);
  else if (event === 'assistant-end') console.log('\n[end]');
});
