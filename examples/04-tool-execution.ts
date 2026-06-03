/**
 * Invoke all 7 tools directly, bypassing the LLM. Useful for
 * smoke-testing the registry and as a reference for each tool's
 * argument schema.
 *
 *   npx tsx examples/04-tool-execution.ts
 */

import { createAdapters } from '../dist/adapters/index.js';

const { tools } = createAdapters();

const list = await tools.list();
console.log(`${list.length} tools: ${list.map((t) => t.name).join(', ')}\n`);

const calls: Array<[string, Record<string, unknown>]> = [
  ['writeFile', { path: '/tmp/pa-example.txt', content: 'Hello from Personal-Assistant.\n' }],
  ['readFile',  { path: '/tmp/pa-example.txt' }],
  ['shell',     { command: 'wc -l /tmp/pa-example.txt' }],
  ['search',    { pattern: 'Personal-Assistant', cwd: '/tmp' }],
  ['remember',  { content: 'Example 4 ran at ' + new Date().toISOString(), tags: ['example'], importance: 5 }],
  ['analyze',   { text: 'Personal-Assistant is a pipeline-driven AI agent.', question: 'One sentence: what kind of agent is this?' }],
  ['respond',   { prompt: 'Reply with a single emoji that represents "success"' }],
];

for (const [name, args] of calls) {
  const r = await tools.invoke(name, args);
  const out = typeof r.output === 'string' ? r.output.trim() : JSON.stringify(r.output);
  console.log(`${name.padEnd(10)} ${r.success ? 'ok' : 'fail'}  ${r.durationMs}ms  ${out.slice(0, 60)}${out.length > 60 ? '…' : ''}`);
}
