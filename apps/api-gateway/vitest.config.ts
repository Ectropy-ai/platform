/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

/**
 * Vitest Configuration for api-gateway
 * Enterprise-grade test configuration aligned with qa-framework.json standards
 *
 * Created: 2025-12-24
 * Purpose: Unit and integration test execution with coverage reporting
 * Aligned with: Enterprise QA framework (Vitest standard)
 * Migration: Completed migration from Jest to Vitest
 *
 * ENTERPRISE FIX (2026-01-05): Use explicit resolve.alias instead of tsconfigPaths plugin
 * ROOT CAUSE: vite-tsconfig-paths is ESM-only, cannot be loaded by require() in CI
 * IMPACT: Tests PASS locally but FAIL in CI with "ESM file cannot be loaded by require"
 * SOLUTION: Use Vite's native resolve.alias (works in both CJS and ESM contexts)
 */
export default defineConfig({
  plugins: [],
  test: {
    // Test environment
    environment: 'node', // Backend/API tests run in Node environment

    // Global test setup
    globals: true,

    // Setup files (if needed for future use)
    setupFiles: [],

    // ENTERPRISE FIX (2026-01-06): Force workspace packages to be loaded from source
    // CRITICAL: When a workspace package exists in both libs/ and node_modules/.pnpm/,
    // Vitest may prioritize node_modules, causing ERR_PACKAGE_PATH_NOT_EXPORTED errors.
    // server.deps.inline forces Vitest to bundle these packages from source (libs/)
    // instead of trying to load them from the pnpm virtual store.
    // Reference: https://vitest.dev/config/#server-deps-inline
    server: {
      deps: {
        inline: [
          '@ectropy/speckle-integration', // Force source path resolution (libs/speckle-integration/src/)
        ],
      },
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],

      // Coverage thresholds aligned with enterprise standards
      // Progressive expansion: 15% (current) → 30% (Month 1) → 90% (target)
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },

      // Files to include in coverage
      include: ['src/**/*.{ts,js}'],

      // Files to exclude from coverage
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/**/*.test.{ts,js}',
        'src/**/*.spec.{ts,js}',
        'tests/**',
        'coverage/**',
        'dist/**',
        '**/node_modules/**',
      ],
    },

    // Test file patterns
    include: [
      'src/**/__tests__/**/*.{test,spec}.{ts,js}',
      'src/**/*.{test,spec}.{ts,js}',
      'tests/**/*.{test,spec}.{ts,js}',
    ],

    // Test file exclusions
    exclude: [
      'node_modules',
      'dist',
      '.nx',
      'coverage',
      // ENTERPRISE FIX: Integration tests now included - CI provides Docker services
      // Phase 2 & 3 of enterprise-test-suite.yml set up postgres + redis via docker compose
    ],

    // Mock configuration
    mockReset: true,
    restoreMocks: true,

    // Test timeout (30 seconds for API tests that may involve I/O)
    testTimeout: 30000,

    // Pool options for better performance
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },

  // Resolve aliases - explicit mappings for @ectropy/* paths
  // ENTERPRISE FIX (2026-01-05): Cannot use tsconfigPaths plugin (ESM-only)
  // Must explicitly define all path mappings that tests need
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Match tsconfig.base.json path mappings (specific before wildcards)
      '@ectropy/shared/config': path.resolve(
        __dirname,
        '../../libs/shared/config/src/index.ts'
      ),
      '@ectropy/shared/integrations': path.resolve(
        __dirname,
        '../../libs/shared/integrations/src'
      ),
      '@ectropy/shared/audit': path.resolve(
        __dirname,
        '../../libs/shared/audit/src'
      ),
      '@ectropy/shared/utils/browser': path.resolve(
        __dirname,
        '../../libs/shared/utils/src/browser.ts'
      ),
      '@ectropy/shared/utils': path.resolve(
        __dirname,
        '../../libs/shared/utils/src/index.ts'
      ),
      '@ectropy/shared/types': path.resolve(
        __dirname,
        '../../libs/shared/types/src/index.ts'
      ),
      '@ectropy/shared': path.resolve(__dirname, '../../libs/shared/src'),
      '@ectropy/auth/enhanced': path.resolve(
        __dirname,
        '../../libs/auth/enhanced'
      ),
      '@ectropy/auth': path.resolve(__dirname, '../../libs/auth/src'),
      '@ectropy/ai-agents-shared': path.resolve(
        __dirname,
        '../../libs/ai-agents/shared/index.ts'
      ),
      '@ectropy/ai-agents': path.resolve(__dirname, '../../libs/ai-agents/src'),
      '@ectropy/ifc-processing': path.resolve(
        __dirname,
        '../../libs/ifc-processing/src/index.ts'
      ),
      '@ectropy/speckle-integration': path.resolve(
        __dirname,
        '../../libs/speckle-integration/src/index.ts'
      ),
    },
  },
});
