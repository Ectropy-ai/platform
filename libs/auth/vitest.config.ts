/**
 * ENTERPRISE VITEST CONFIGURATION - Auth Library
 *
 * Purpose: Configure Vitest for auth library unit tests
 * Target Coverage: 95% (security-critical module)
 */

import { defineConfig } from 'vitest/config';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Exclude old Jest-based tests
      'src/middleware/__tests__/rbac.middleware.spec.ts',
    ],
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.{test,spec}.ts',
        'src/**/__tests__/**',
        'src/**/index.ts',
        'src/types/**',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@ectropy/shared/utils': path.resolve(__dirname, '../shared/utils/src/index.ts'),
      '@ectropy/shared/types/express': path.resolve(__dirname, '../shared/types/src/express.ts'),
      '@ectropy/shared/types': path.resolve(__dirname, '../shared/types/src/index.ts'),
    },
  },
});
