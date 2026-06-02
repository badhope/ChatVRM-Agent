#!/usr/bin/env node
/**
 * Example 5 — Long-term Memory
 *
 * Writes 5 memories, then runs a full-text search and a tag-based filter
 * to show how MiniSearch-backed retrieval works.
 *
 * Run with:
 *   npx tsx examples/05-memory.ts
 */

import { createAdapters } from '../dist/adapters/index.js';

async function main() {
  console.log('🚀 Example 5 — Long-term Memory\n');

  const { memory } = createAdapters();

  // 1) Store some memories
  const entries = [
    { content: 'TypeScript 5.8 introduces more strict checking for generic constraints.', tags: ['typescript', 'language'] },
    { content: 'React 19 server components are stable and ship with Vite 6 support.', tags: ['react', 'framework'] },
    { content: 'MiniSearch supports prefix search, fuzzy match, and field boosting out of the box.', tags: ['search', 'library'] },
    { content: 'Pipeline-driven agents (initialize → understand → plan → execute → validate → reflect) compose nicely.', tags: ['agent', 'architecture'] },
    { content: 'For sensitive data, always prefer environment variables over hard-coded literals.', tags: ['security', 'best-practices'] },
  ];

  console.log('Storing 5 memories…');
  for (const e of entries) {
    const id = await memory.add(e.content, { tags: e.tags, importance: 5 });
    console.log(`  + [${id.slice(0, 8)}] ${e.content.slice(0, 60)}…`);
  }
  console.log();

  // 2) Full-text search
  console.log('Search: "agent"');
  const searchHits = await memory.search('agent', { limit: 10 });
  for (const h of searchHits) {
    console.log(`  · score=${h.score.toFixed(2)}  ${h.record.content.slice(0, 70)}…`);
  }
  console.log();

  // 3) Tag filter
  console.log('Tag: "react"');
  const tagHits = await memory.list({ tags: ['react'], limit: 10 });
  for (const m of tagHits) {
    console.log(`  · [${m.tags.join(', ')}]  ${m.content.slice(0, 70)}…`);
  }
  console.log();

  // 4) Stats
  const stats = await memory.stats();
  console.log('Memory stats:', stats);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
