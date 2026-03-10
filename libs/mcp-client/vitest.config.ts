/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

/**
 * Vitest Configuration for @ectropy/mcp-client
 * Enterprise-grade test configuration for MCP client library
 *
 * Created: 2026-01-01
 * Purpose: Unit test execution with coverage reporting
 * Migration: Jest → Vitest (enterprise standardization)
 * Pattern: Aligned with libs/ai-agents and libs/shared vitest configurations
 */
export default defineConfig({
  plugins: [],
  test: {
    // Test environment
    environment: 'node', // MCP client runs in Node environment

    // Global test setup (enables describe, it, expect without imports)
    globals: true,

    // Setup files
    setupFiles: [],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],

      // Coverage thresholds for libraries (enterprise standards)
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },

      // Files to include in coverage
      include: ['**/src/**/*.{ts,js}', '!**/src/**/*.d.ts'],

      // Files to exclude from coverage
      exclude: [
        '**/src/**/*.d.ts',
        '**/src/**/__tests__/**',
        '**/src/**/*.test.{ts,js}',
        '**/src/**/*.spec.{ts,js}',
        'coverage/**',
        'dist/**',
        '**/node_modules/**',
      ],
    },

    // Test file patterns (all spec and test files)
    include: [
      '**/src/**/__tests__/**/*.{test,spec}.{ts,js}',
      '**/src/**/*.{test,spec}.{ts,js}',
      '**/*.{test,spec}.{ts,js}',
    ],

    // Test file exclusions
    exclude: ['node_modules', 'dist', 'coverage'],

    // Mock configuration
    mockReset: true,
    restoreMocks: true,

    // Test timeout (10 seconds for unit tests)
    testTimeout: 10000,

    // Pool options for better performance
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },

  // Resolve aliases for internal imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ectropy/mcp-client': path.resolve(__dirname, './index.ts'),
    },
  },
});
