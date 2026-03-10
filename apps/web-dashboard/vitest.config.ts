/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vitest Configuration for web-dashboard
 * Enterprise-grade test configuration with coverage thresholds
 *
 * Created: 2025-12-22
 * Purpose: Component and unit test execution with coverage reporting
 * Aligned with: Test expansion strategy (Phase 1 - 30% target)
 *
 * TypeScript FIX: Import defineConfig from 'vitest/config' instead of 'vite'
 * This ensures the UserConfigExport type includes the 'test' property
 */
export default defineConfig({
  plugins: [react()],
  test: {
    // Test environment
    environment: 'jsdom',

    // Global test setup
    globals: true,

    // Setup files
    setupFiles: ['./src/test-utils/setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],

      // Coverage thresholds (Phase 1 targets)
      // Will increase progressively: 30% (Week 1) → 60% (Week 2) → 80% (Week 3)
      thresholds: {
        global: {
          branches: 30, // Target: Week 1
          functions: 30, // Target: Week 1
          lines: 30, // Target: Week 1
          statements: 30, // Target: Week 1
        },
      },

      // Files to include in coverage
      include: ['src/**/*.{ts,tsx}'],

      // Files to exclude from coverage
      exclude: [
        'src/**/*.d.ts',
        'src/test-utils/**',
        'src/**/__tests__/**',
        'src/**/*.stories.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },

    // Test file patterns
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],

    // Test file exclusions
    exclude: ['node_modules', 'dist', '.nx', 'coverage'],

    // Mock configuration
    mockReset: true,
    restoreMocks: true,

    // Test timeout (10 seconds for component tests)
    testTimeout: 10000,
  },

  // Resolve aliases (match vite.config.ts)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
