#!/usr/bin/env node
/**
 * Example 3 — 6-stage Pipeline (Agent Mode)
 *
 * Runs the full 6-stage pipeline: initialize → understand → plan → execute
 * → validate → reflect. Subscribes to the event bus and prints each event
 * as it streams.
 *
 * Run with:
 *   npx tsx examples/03-pipeline-run.ts "Write a Python function that counts file lines"
 */

import { PipelineEngine, createEventBus } from '../dist/core/index.js';
import { createAdapters } from '../dist/adapters/index.js';
import { AgentMachine } from '../dist/machines/agent.machine.js';

const task = process.argv.slice(2).join(' ').trim() || 'List the files in the current directory';

async function main() {
  console.log('🚀 Example 3 — 6-stage Pipeline\n');
  console.log(`Task: ${task}\n`);

  const adapters = createAdapters();
  const eventBus = createEventBus();

  // Print events as they stream
  eventBus.on('stage', (e: any) => {
    const sym = e.status === 'done' ? '✅' : e.status === 'failed' ? '❌' : e.status === 'running' ? '⏳' : '·';
    console.log(`${sym}  stage: ${e.stage.padEnd(11)} → ${e.status}`);
  });
  eventBus.on('understand', (e: any) => {
    console.log(`   intent: ${e.intent}`);
  });
  eventBus.on('plan', (e: any) => {
    console.log(`   plan:   ${e.steps.length} step(s)`);
    for (const s of e.steps) console.log(`     - [${s.id}] ${s.description}${s.tool ? `  (${s.tool})` : ''}`);
  });
  eventBus.on('step', (e: any) => {
    console.log(`   step:   [${e.step.id}] ${e.status}${e.result?.toolName ? `  via ${e.result.toolName}` : ''}`);
  });
  eventBus.on('error', (e: any) => {
    console.error(`   error:  ${e.message ?? e.error}`);
  });
  eventBus.on('pipeline-end', (e: any) => {
    console.log(`\n${e.success ? '🎉 SUCCESS' : '💥 FAILED'}${e.failed ? ` @ stage ${e.failed}` : ''}`);
    if (e.createdFiles?.length) console.log(`   created:  ${e.createdFiles.join(', ')}`);
    if (e.modifiedFiles?.length) console.log(`   modified: ${e.modifiedFiles.join(', ')}`);
  });

  const engine = new PipelineEngine({ adapters, eventBus, machine: new AgentMachine() });
  const result = await engine.run(task, { cwd: process.cwd() });

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
