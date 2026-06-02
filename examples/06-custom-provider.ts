#!/usr/bin/env node
/**
 * Example 6 — Custom LLM Provider (HuggingFace)
 *
 * Demonstrates how to register a brand-new LLM provider. The official
 * adapters cover 10 providers, but you can extend the `LLMAdapter` with
 * any HTTP endpoint that speaks the OpenAI protocol.
 *
 * To switch to HuggingFace, just change the baseUrl + defaultModel.
 *
 * Run with:
 *   HUGGINGFACE_API_KEY=hf_xxx npx tsx examples/06-custom-provider.ts
 */

import { ConfigAdapter, LLMAdapter } from '../dist/adapters/index.js';
import type { ILLMPort, IConfigPort, Message } from '../dist/ports/index.js';

async function main() {
  console.log('🚀 Example 6 — Custom LLM Provider\n');

  const config: IConfigPort = new ConfigAdapter();
  const llm: ILLMPort = new LLMAdapter(config);

  // The standard LLMAdapter supports any provider that exposes an
  // OpenAI-compatible /v1/chat/completions endpoint. We just need to
  // set the baseUrl and provide an API key.

  // For this example we register a runtime-only provider via the
  // config adapter so we don't touch ~/.config files.
  const providerId = 'siliconflow' as const;
  // (Replace with 'huggingface', 'groq', 'mistral', 'together' etc. and
  //  adjust baseUrl accordingly.)

  const messages: Message[] = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Name three benefits of using a pipeline-driven agent.' },
  ];

  process.stdout.write('Response: ');
  for await (const chunk of llm.stream(messages, {
    provider: providerId,
    model: 'Qwen/Qwen2.5-7B-Instruct',
    temperature: 0.5,
    maxTokens: 512,
  })) {
    process.stdout.write(chunk.content);
  }
  process.stdout.write('\n');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
