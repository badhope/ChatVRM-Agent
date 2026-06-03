/**
 * One-shot streaming chat against the configured default provider.
 *
 *   npx tsx examples/01-basic-chat.ts
 *
 * Reads the API key from `~/.config/personal-assistant-nodejs/config.json`
 * (set it via the Web UI Config page, or an env var like OPENAI_API_KEY).
 */

import { createAdapters } from '../dist/adapters/index.js';
import type { Message } from '../dist/ports/llm.port.js';

const { config, llm } = createAdapters();
const provider = await config.getDefaultProvider();
const chat = await config.getChatConfig();

const messages: Message[] = [
  { role: 'system', content: 'You are a helpful assistant. Reply concisely.' },
  { role: 'user', content: 'In one sentence, what is a personal AI agent?' },
];

process.stdout.write(`${provider} > `);
for await (const chunk of llm.stream(messages, {
  provider,
  model: chat.model,
  temperature: 0.5,
  maxTokens: 256,
})) {
  process.stdout.write(chunk.content);
}
process.stdout.write('\n');
