#!/usr/bin/env node
/**
 * Example 7 — SDK Quickstart
 *
 * Uses the standalone SDK (sdk/) to run a plan-then-act workflow.
 * The SDK exposes a `PersonalAssistantAgent` class with `.plan()` and
 * `.execute()` methods, so you can review the plan before committing.
 *
 * Run with:
 *   npx tsx examples/07-sdk-quickstart.ts "Refactor the README"
 */

import { PersonalAssistantAgent, planTask, executePlan } from '../sdk/src/index.js';

const task = process.argv.slice(2).join(' ').trim() || 'Add a table of contents to README.md';

async function main() {
  console.log('🚀 Example 7 — SDK Quickstart\n');
  console.log(`Task: ${task}\n`);

  // 1) Plan
  const plan = await planTask(task, { rootDir: process.cwd() });
  console.log('─── Plan ───────────────────────────────────────');
  console.log(`Intent:    ${plan.intent}`);
  console.log(`Steps:     ${plan.estimatedSteps}`);
  console.log(`Files:     ${plan.filesToModify.join(', ') || '(none)'}`);
  console.log(`Risks:     ${plan.risks.join(', ') || '(none)'}`);
  console.log();
  for (const s of plan.steps) {
    console.log(`  [${s.id}] ${s.description}${s.tool ? `  → ${s.tool}` : ''}`);
  }
  console.log();

  // 2) Execute (autoApprove to skip prompts)
  console.log('─── Execute ────────────────────────────────────');
  const result = await executePlan(plan, {
    autoApprove: true,
    dryRun: false,
    rootDir: process.cwd(),
  });
  console.log(`\nAll success: ${result.allSuccess}`);
  console.log(`Duration:    ${result.durationMs}ms`);
  console.log(`Summary:     ${result.summary}`);

  // Alternative: one-shot run without manual review
  // const result = await new PersonalAssistantAgent().run(task);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
