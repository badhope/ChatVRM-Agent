/**
 * Plan-then-execute via the standalone SDK. Same pipeline as
 * `03-pipeline-run.ts`, but expressed through the high-level SDK API.
 *
 *   npx tsx examples/07-sdk-quickstart.ts "Add a table of contents to README.md"
 */

import { planTask, executePlan } from '../sdk/src/index.js';

const task = process.argv.slice(2).join(' ').trim() || 'Add a table of contents to README.md';

const plan = await planTask(task, { rootDir: process.cwd() });
console.log(`intent:    ${plan.intent}`);
console.log(`steps:     ${plan.estimatedSteps}`);
console.log(`files:     ${plan.filesToModify.join(', ') || '(none)'}`);
console.log(`risks:     ${plan.risks.join(', ') || '(none)'}`);
for (const s of plan.steps) console.log(`  [${s.id}] ${s.description}${s.tool ? `  → ${s.tool}` : ''}`);

console.log('\nexecuting…');
const result = await executePlan(plan, { autoApprove: true, dryRun: false, rootDir: process.cwd() });
console.log(`\n${result.allSuccess ? 'OK' : 'FAILED'} in ${result.durationMs}ms`);
console.log(result.summary);
