#!/usr/bin/env node
/**
 * Example 1 — Basic Chat (low-level LLM port)
 *
 * Sends a single message to the configured default provider and prints
 * the streaming response chunk-by-chunk.
 *
 * Prerequisites:
 *   1. Configure a provider + API key in the Web UI (Config page)
 *      OR set an environment variable like OPENAI_API_KEY.
 *   2. Build the project: `npm run build`
 *
 * Run with:
 *   npx tsx examples/01-basic-chat.ts
 */

import { createAdapters } from '../dist/adapters/index.js';
import type { Message, ChatParams } from '../dist/ports/llm.port.js';

async function main() {
  console.log('🚀 Example 1 — Basic Chat\n');

  const { config, llm } = createAdapters();
  const defaultProvider = await config.getDefaultProvider();
  const chat = await config.getChatConfig();

  console.log(`Provider: ${defaultProvider}`);
  console.log(`Model:    ${chat.model ?? '(default)'}\n`);

  const messages: Message[] = [
    { role: 'system', content: 'You are a helpful assistant. Reply concisely.' },
    { role: 'user', content: 'In one sentence, what is a personal AI agent?' },
  ];

  const params: ChatParams = {
    provider: defaultProvider,
    model: chat.model,
    temperature: 0.5,
    maxTokens: 256,
  };

  process.stdout.write('Response: ');
  for await (const chunk of llm.stream(messages, params)) {
    process.stdout.write(chunk.content);
  }
  process.stdout.write('\n');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
