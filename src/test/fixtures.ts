/**
 * Test Fixtures
 *
 * Shared mock data for unit and integration tests.
 */

export const mockMemoryEntry = {
  input: 'test input',
  output: 'test output',
  provider: 'aliyun',
  model: 'qwen-max',
  timestamp: Date.now()
};

export const mockProviderResponse = {
  content: 'test response',
  usage: { promptTokens: 10, completionTokens: 20 }
};

export const mockChatMessage = {
  role: 'user' as const,
  content: 'Hello, how are you?'
};

export const mockChatResponse = {
  role: 'assistant' as const,
  content: 'I am doing well, thank you!'
};

export const mockConfig = {
  defaultProvider: 'aliyun',
  apiKeys: {
    aliyun: 'test-api-key'
  },
  chat: {
    defaultTemperature: 0.7,
    defaultMaxTokens: 4000,
    saveHistory: true,
    historyLimit: 100
  }
};
