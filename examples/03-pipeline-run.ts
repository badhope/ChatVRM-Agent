/**
 * Run the full 6-stage pipeline against a task passed on the command line.
 * Subscribes to the event bus and prints every event as it streams.
 *
 *   npx tsx examples/03-pipeline-run.ts "List the files in the current dir"
 */

import { PipelineEngine, createEventBus } from '../dist/core/index.js';
import { createAdapters } from '../dist/adapters/index.js';
import { AgentMachine } from '../dist/machines/agent.machine.js';

const task = process.argv.slice(2).join(' ').trim() || 'List the files in the current directory';

const adapters = createAdapters();
const bus = createEventBus();

bus.on('stage', (e) => {
  const sym = e.status === 'done' ? '✓' : e.status === 'failed' ? '✗' : e.status === 'running' ? '·' : '·';
  console.log(`${sym}  ${e.stage.padEnd(11)} ${e.status}`);
});
bus.on('understand', (e) => console.log(`   intent: ${e.intent}`));
bus.on('plan', (e) => {
  for (const s of e.steps) console.log(`   - [${s.id}] ${s.description}${s.tool ? `  (${s.tool})` : ''}`);
});
bus.on('step', (e) => {
  console.log(`   step [${e.step.id}] ${e.status}${e.result?.toolName ? `  via ${e.result.toolName}` : ''}`);
});
bus.on('pipeline-end', (e) => {
  console.log(`\n${e.success ? 'OK' : 'FAILED'}${e.failed ? ` @ ${e.failed}` : ''}`);
  if (e.createdFiles?.length) console.log(`  created:  ${e.createdFiles.join(', ')}`);
  if (e.modifiedFiles?.length) console.log(`  modified: ${e.modifiedFiles.join(', ')}`);
});
bus.on('error', (e) => console.error(`  error: ${e.message ?? e.error}`));

const engine = new PipelineEngine({ adapters, eventBus: bus, machine: new AgentMachine() });
const result = await engine.run(task, { cwd: process.cwd() });

process.exit(result.success ? 0 : 1);
