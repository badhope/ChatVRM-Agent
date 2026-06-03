/**
 * Add a few memories, run a full-text search, and a tag filter. Shows
 * the MiniSearch-backed retrieval in action.
 *
 *   npx tsx examples/05-memory.ts
 */

import { createAdapters } from '../dist/adapters/index.js';

const { memory } = createAdapters();

const items = [
  { content: 'TypeScript 5.8 tightens generic constraint checks.',                          tags: ['typescript'] },
  { content: 'React 19 server components are stable with Vite 6 support.',                  tags: ['react'] },
  { content: 'MiniSearch supports prefix, fuzzy, and field boosting out of the box.',         tags: ['search'] },
  { content: 'Pipeline-driven agents compose cleanly across stages.',                        tags: ['agent', 'architecture'] },
  { content: 'For secrets, prefer env vars over literals.',                                  tags: ['security'] },
];

console.log('Storing…');
for (const e of items) {
  const id = await memory.add(e.content, { tags: e.tags, importance: 5 });
  console.log(`  + ${id.slice(0, 8)}  ${e.content.slice(0, 56)}…`);
}
console.log();

console.log('search: "agent"');
for (const h of await memory.search('agent', { limit: 5 })) {
  console.log(`  ${h.score.toFixed(2)}  ${h.record.content.slice(0, 64)}…`);
}
console.log();

console.log('tag: "react"');
for (const m of await memory.list({ tags: ['react'], limit: 5 })) {
  console.log(`  ${m.content.slice(0, 64)}…`);
}
console.log();

console.log('stats:', await memory.stats());
