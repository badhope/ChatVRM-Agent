#!/usr/bin/env node
/**
 * Example 2 — Multi-turn Chat Session
 *
 * Demonstrates how to maintain a multi-turn conversation. The same
 * `Message[]` array grows as the user / assistant exchange progresses.
 *
 * Run with:
 *   npx tsx examples/02-multi-turn.ts
 */

import { createAdapters } from '../dist/adapters/index.js';
import type { Message } from '../dist/ports/llm.port.js';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function main() {
  console.log('🚀 Example 2 — Multi-turn Chat');
  console.log('Type your message and press Enter. Send "exit" to quit.\n');

  const { config, llm } = createAdapters();
  const provider = await config.getDefaultProvider();
  const chat = await config.getChatConfig();

  const messages: Message[] = [
    { role: 'system', content: 'You are a concise, friendly assistant.' },
  ];

  const rl = createInterface({ input, output });

  while (true) {
    const userText = (await rl.question('You: ')).trim();
    if (!userText) continue;
    if (userText.toLowerCase() === 'exit') break;

    messages.push({ role: 'user', content: userText });

    process.stdout.write('Bot: ');
    let full = '';
    for await (const chunk of llm.stream(messages, {
      provider,
      model: chat.model,
      temperature: 0.7,
      maxTokens: 1024,
    })) {
      process.stdout.write(chunk.content);
      full += chunk.content;
    }
    process.stdout.write('\n\n');

    messages.push({ role: 'assistant', content: full });
  }

  rl.close();
  console.log('\n👋 Bye!');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
