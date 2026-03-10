/**
 * Test setup and global configurations
 * Compatible with Vitest
 */

import dotenv from 'dotenv';
import { beforeAll, afterAll, expect } from 'vitest';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test configuration
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  // Configure logging for tests
  process.env.LOG_LEVEL = 'error';
  // Database configuration for tests
  process.env.DB_NAME = process.env.DB_NAME || 'ectropy_test';
  process.env.REDIS_DB = '15'; // Use separate Redis DB for tests
});

afterAll(async () => {
  // Cleanup after all tests
  // Close database connections, etc.
});

// Vitest custom matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },
});

// Declare custom matchers for TypeScript
declare module 'vitest' {
  interface Assertion<T = unknown> {
    toBeValidUUID(): T;
  }
  interface AsymmetricMatchersContaining {
    toBeValidUUID(): unknown;
  }
}
