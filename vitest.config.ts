import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      '**/*.test.ts.skip',
      '**/mcp/**',
      '**/sdk/**',
      '**/examples/**',
      '**/plugins/**',
      '**/scripts/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/core/**',
        'src/stages/**',
        'src/domain/**',
        'src/infrastructure/**',
        'src/adapters/**',
        'src/cli/**',
      ],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.test.ts',
        'src/__tests__/**',
        '**/index.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});