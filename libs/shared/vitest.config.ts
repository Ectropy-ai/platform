/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

/**
 * Vitest Configuration for @ectropy/shared
 * Enterprise-grade test configuration for shared utilities library
 *
 * Created: 2025-12-30
 * Purpose: Unit test execution for shared utilities with coverage reporting
 * Migration: Jest → Vitest (enterprise standardization)
 * Aligned with: api-gateway vitest configuration pattern
 */
export default defineConfig({
  plugins: [],
  test: {
    // Test environment
    environment: 'node', // Library utilities run in Node environment

    // Global test setup (enables describe, it, expect without imports)
    globals: true,

    // Setup files
    setupFiles: [],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],

      // Coverage thresholds for shared utilities (high standards)
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
      '@ectropy/shared/utils': path.resolve(__dirname, './utils/src'),
      '@ectropy/shared/audit': path.resolve(__dirname, './audit/src'),
      '@ectropy/shared/middleware': path.resolve(__dirname, './middleware/src'),
      '@ectropy/shared/types': path.resolve(__dirname, './types/src'),
      '@ectropy/shared/config': path.resolve(__dirname, './config/src'),
      '@ectropy/shared/oauth': path.resolve(__dirname, './oauth/src'),
    },
  },
});
