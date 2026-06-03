import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IConfigPort, ProviderType } from '../../../ports/config.port.js';
import type { StreamChunk } from '../../../ports/llm.port.js';

const mockApiKeys: Record<string, string | undefined> = {};
const mockDefaultProvider: ProviderType = 'openai';

const mockConfigPort: IConfigPort = {
  init: vi.fn(),
  getApiKey: vi.fn(async (provider: ProviderType) => mockApiKeys[provider]),
  setApiKey: vi.fn(async (provider: ProviderType, key: string) => {
    mockApiKeys[provider] = key;
  }),
  removeApiKey: vi.fn(async (provider: ProviderType) => {
    delete mockApiKeys[provider];
  }),
  getDefaultProvider: vi.fn(async () => mockDefaultProvider),
  setDefaultProvider: vi.fn(async (provider: ProviderType) => {
    Object.assign(mockDefaultProvider, provider);
  }),
  getChatConfig: vi.fn(),
  updateChatConfig: vi.fn(),
  getSandboxConfig: vi.fn(),
  updateSandboxConfig: vi.fn(),
  getCircuitBreakerConfig: vi.fn(),
  getAllConfig: vi.fn(),
  exists: vi.fn(),
};

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

function createMockResponse(status: number, body: unknown, ok = true): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    headers: new Headers({ 'content-type': 'application/json' }),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    clone: vi.fn(),
    redirected: false,
    type: 'basic' as const,
    url: 'https://api.openai.com/v1/chat/completions',
  } as unknown as Response;
}

vi.mock('../../../infrastructure/circuit-breaker.js', () => ({
  CircuitBreaker: {
    createPreset: vi.fn(() => ({
      fire: vi.fn(async (fn: () => Promise<unknown>) => fn()),
      getState: vi.fn(() => 'CLOSED'),
      getStats: vi.fn(() => ({ failures: 0, successes: 0, state: 'CLOSED' })),
      reset: vi.fn(),
      destroy: vi.fn(),
    })),
  },
  CircuitState: { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' },
}));

import { LLMAdapter } from '../../../adapters/llm.adapter.js';

describe('LLMAdapter', () => {
  let adapter: LLMAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    adapter = new LLMAdapter(mockConfigPort);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('chat', () => {
    it('should use default provider when none specified', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, {
          choices: [{ message: { content: 'Hello!' } }],
          model: 'gpt-4o',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );

      await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('api.openai.com');
    });

    it('should return ChatResponse with content, model, usage', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, {
          choices: [{ message: { content: 'Test response' } }],
          model: 'gpt-4o',
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        }),
      );

      const response = await adapter.chat({ messages: [{ role: 'user', content: 'test' }] });

      expect(response.content).toBe('Test response');
      expect(response.model).toBe('gpt-4o');
      expect(response.usage.promptTokens).toBe(20);
      expect(response.usage.completionTokens).toBe(10);
      expect(response.usage.totalTokens).toBe(30);
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(500, { error: 'Internal Server Error' }, false),
      );

      await expect(
        adapter.chat({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toThrow('LLM request failed');
    });
  });

  describe('stream', () => {
    it('should yield chunks from SSE stream', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" World"}}]}\n\ndata: [DONE]\n\n',
      ];

      function createStreamResponse(chunks: string[]): Response {
        const encoder = new TextEncoder();
        let index = 0;
        const readable = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (index < chunks.length) {
              controller.enqueue(encoder.encode(chunks[index]));
              index++;
            } else {
              controller.close();
            }
          },
        });

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: readable,
          bodyUsed: false,
          json: vi.fn(),
          text: vi.fn(),
          arrayBuffer: vi.fn(),
          blob: vi.fn(),
          formData: vi.fn(),
          clone: vi.fn(),
          redirected: false,
          type: 'basic' as const,
          url: 'https://api.openai.com/v1/chat/completions',
        } as unknown as Response;
      }

      mockFetch.mockResolvedValue(createStreamResponse(sseChunks));

      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.stream({ messages: [{ role: 'user', content: 'hello' }] })) {
        chunks.push(chunk);
      }

      const contents = chunks.filter((c) => !c.done).map((c) => c.content);
      expect(contents).toContain('Hello');
      expect(contents).toContain(' World');
      expect(chunks.some((c) => c.done)).toBe(true);
    });

    it('should yield done marker', async () => {
      function createEmptyStream(): Response {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          bodyUsed: false,
          json: vi.fn(),
          text: vi.fn(),
          arrayBuffer: vi.fn(),
          blob: vi.fn(),
          formData: vi.fn(),
          clone: vi.fn(),
          redirected: false,
          type: 'basic' as const,
          url: '',
        } as unknown as Response;
      }

      mockFetch.mockResolvedValue(createEmptyStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.stream({ messages: [{ role: 'user', content: 'hi' }] })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1].done).toBe(true);
    });

    it('should handle invalid JSON in SSE gracefully', async () => {
      const sseChunks = ['data: {invalid json}\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'];

      function createStreamWithInvalidJson(): Response {
        const encoder = new TextEncoder();
        let index = 0;
        const readable = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (index < sseChunks.length) {
              controller.enqueue(encoder.encode(sseChunks[index]));
              index++;
            } else {
              controller.close();
            }
          },
        });

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: readable,
          bodyUsed: false,
          json: vi.fn(),
          text: vi.fn(),
          arrayBuffer: vi.fn(),
          blob: vi.fn(),
          formData: vi.fn(),
          clone: vi.fn(),
          redirected: false,
          type: 'basic' as const,
          url: '',
        } as unknown as Response;
      }

      mockFetch.mockResolvedValue(createStreamWithInvalidJson());

      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.stream({ messages: [{ role: 'user', content: 'hi' }] })) {
        chunks.push(chunk);
      }

      const okChunk = chunks.find((c) => c.content === 'ok');
      expect(okChunk).toBeDefined();
    });
  });

  describe('listModels', () => {
    it('should return model IDs', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, {
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'gpt-4-turbo', object: 'model' },
          ],
        }),
      );

      const models = await adapter.listModels('openai');

      expect(models).toEqual(['gpt-4o', 'gpt-4-turbo']);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(500, { error: 'server error' }, false),
      );

      const models = await adapter.listModels('openai');

      expect(models).toEqual([]);
    });
  });

  describe('isAvailable', () => {
    it('should return true for successful HEAD', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, {}),
      );

      const available = await adapter.isAvailable('openai');

      expect(available).toBe(true);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValue(new Error('connection refused'));

      const available = await adapter.isAvailable('openai');

      expect(available).toBe(false);
    });

    it('should return false for google provider when no API key is configured', async () => {
      delete mockApiKeys.google;

      const available = await adapter.isAvailable('google');

      expect(available).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return true for google provider when API key is configured', async () => {
      mockApiKeys.google = 'AIza-test-key';

      const available = await adapter.isAvailable('google');

      expect(available).toBe(true);
    });
  });

  describe('baidu streaming', () => {
    it('should throw an explicit error when streaming is requested for baidu', async () => {
      mockApiKeys.baidu = 'baidu-test-key';

      const iterator = adapter.stream({
        provider: 'baidu',
        messages: [{ role: 'user', content: 'hi' }],
      });

      await expect(iterator.next()).rejects.toThrow(/baidu/i);
    });
  });

  describe('auth headers', () => {
    it('should skip auth header for ollama', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, {
          choices: [{ message: { content: 'ok' } }],
          model: 'llama3.2',
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
      );

      await adapter.chat({ provider: 'ollama', messages: [{ role: 'user', content: 'hi' }] });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should skip auth header for lmstudio', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, {
          choices: [{ message: { content: 'ok' } }],
          model: 'local-model',
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
      );

      await adapter.chat({ provider: 'lmstudio', messages: [{ role: 'user', content: 'hi' }] });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('api key whitespace handling (regression)', () => {
    it('should trim leading/trailing whitespace from configured keys', async () => {
      mockApiKeys.openai = '  sk-trimmed  ';
      mockFetch.mockResolvedValue(
        createMockResponse(200, {
          choices: [{ message: { content: 'ok' } }],
          model: 'gpt-4',
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
      );

      await adapter.chat({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-trimmed');
    });
  });
});