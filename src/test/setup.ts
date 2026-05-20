import { vi } from 'vitest';

// Global test setup
vi.mock('../config/manager.js', () => ({
  ConfigManager: class MockConfigManager {
    getApiKey = vi.fn();
    setApiKey = vi.fn();
    getDefaultProvider = vi.fn();
    getChatConfig = vi.fn(() => ({
      defaultTemperature: 0.7,
      defaultMaxTokens: 4000,
      saveHistory: true,
      historyLimit: 100
    }));
  }
}));

// Mock console methods to reduce noise during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
