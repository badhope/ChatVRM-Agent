#!/usr/bin/env node
/**
 * Example 4 — Direct Tool Execution
 *
 * Bypasses the LLM entirely and calls each of the 7 registered tools
 * directly. Useful for debugging tools or building a custom CLI.
 *
 * Run with:
 *   npx tsx examples/04-tool-execution.ts
 */

import { createAdapters } from '../dist/adapters/index.js';

async function main() {
  console.log('🚀 Example 4 — Direct Tool Execution\n');

  const { tools } = createAdapters();

  // 1) List available tools
  const toolList = await tools.list();
  console.log(`Available tools (${toolList.length}):`);
  for (const t of toolList) {
    const req = t.schema.filter((f) => f.required).map((f) => f.name);
    console.log(`  - ${t.name.padEnd(11)} required: [${req.join(', ') || '—'}]`);
  }
  console.log();

  // 2) writeFile
  const write = await tools.invoke('writeFile', {
    path: '/tmp/pa-example.txt',
    content: 'Hello from Personal-Assistant!\nThis file was written by an example tool call.',
  });
  console.log(`writeFile → ${write.success ? 'ok' : 'fail'} (${write.durationMs}ms)`);

  // 3) readFile
  const read = await tools.invoke('readFile', { path: '/tmp/pa-example.txt' });
  console.log(`readFile  → ${read.success ? 'ok' : 'fail'}  bytes=${(read.output as string).length}`);

  // 4) shell
  const shell = await tools.invoke('shell', { command: 'wc -l /tmp/pa-example.txt' });
  console.log(`shell     → ${shell.success ? 'ok' : 'fail'}  output=${(shell.output as string).trim()}`);

  // 5) search
  const search = await tools.invoke('search', { pattern: 'Personal-Assistant', cwd: '/tmp' });
  console.log(`search    → ${search.success ? 'ok' : 'fail'}  matches=${(search.output as any).length ?? 0}`);

  // 6) remember
  const remember = await tools.invoke('remember', {
    content: 'Example 4 ran successfully at ' + new Date().toISOString(),
    tags: ['example', 'demo'],
    importance: 5,
  });
  console.log(`remember  → ${remember.success ? 'ok' : 'fail'}`);

  // 7) analyze
  const analyze = await tools.invoke('analyze', {
    text: 'Personal-Assistant is a pipeline-driven AI agent that runs real LLM calls.',
    question: 'What kind of agent is this in one sentence?',
  });
  console.log(`analyze   → ${analyze.success ? 'ok' : 'fail'}  (${(analyze.output as string).length} chars)`);

  // 8) respond
  const respond = await tools.invoke('respond', {
    prompt: 'Reply with a single emoji that represents "success"',
  });
  console.log(`respond   → ${respond.success ? 'ok' : 'fail'}  output=${(respond.output as string).trim()}`);

  console.log('\n✨ All 7 tools executed');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
