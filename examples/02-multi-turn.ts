/**
 * Interactive REPL — same `Message[]` history, no per-request API roundtrips
 * for the client. Press Ctrl-D or type `exit` to leave.
 *
 *   npx tsx examples/02-multi-turn.ts
 */

import { createAdapters } from '../dist/adapters/index.js';
import type { Message } from '../dist/ports/llm.port.js';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const { config, llm } = createAdapters();
const provider = await config.getDefaultProvider();
const chat = await config.getChatConfig();

const messages: Message[] = [
  { role: 'system', content: 'You are a concise, friendly assistant.' },
];

const rl = createInterface({ input, output, terminal: false });

console.log('Multi-turn chat. Type `exit` to leave.\n');

for await (const line of rl) {
  const text = line.trim();
  if (!text) continue;
  if (text === 'exit') break;

  messages.push({ role: 'user', content: text });

  process.stdout.write('> ');
  let reply = '';
  for await (const chunk of llm.stream(messages, {
    provider,
    model: chat.model,
    temperature: 0.7,
    maxTokens: 1024,
  })) {
    process.stdout.write(chunk.content);
    reply += chunk.content;
  }
  process.stdout.write('\n\n');

  messages.push({ role: 'assistant', content: reply });
}
