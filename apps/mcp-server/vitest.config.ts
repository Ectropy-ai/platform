/**
 * Vitest Configuration for MCP Server
 * Enterprise-grade testing setup for integration and unit tests
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global setup/teardown (paths relative to repo root when running via nx)
    globalSetup: './apps/mcp-server/src/__tests__/setup/global-setup.ts',
    setupFiles: [
      './apps/mcp-server/src/__tests__/setup/test-setup.ts',
      './apps/mcp-server/src/vitest-setup.ts',
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        '**/node_modules/**',
        '**/__tests__/**',
        '**/dist/**',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/webpack.config.cjs',
      ],
      // Enterprise target: 60% minimum
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },

    // Test timeout
    testTimeout: 30000, // 30 seconds for integration tests

    // Run tests in sequence for integration tests (avoid port conflicts)
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },

    // Test file patterns (relative to repo root when running via nx)
    include: [
      'apps/mcp-server/src/**/*.{test,spec}.{js,ts}',
    ],

    // Exclude patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],

    // Reporters - using verbose and json only (html requires @vitest/ui version match)
    reporters: ['verbose', 'json'],

    // Mock configuration
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@config': path.resolve(__dirname, './src/config'),
      '@services': path.resolve(__dirname, './src/services'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@routes': path.resolve(__dirname, './src/routes'),
      '@agents': path.resolve(__dirname, './src/agents'),
    },
  },
});
