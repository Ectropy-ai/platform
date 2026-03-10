/**
 * Test Setup
 * Runs before each test file
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Mock console methods to reduce noise in tests
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

beforeAll(() => {
  // Suppress console output during tests unless DEBUG=true
  if (!process.env.DEBUG) {
    // eslint-disable-next-line no-empty-function
    console.log = () => {
      // Intentionally empty - suppresses test output
    };
    // eslint-disable-next-line no-empty-function
    console.error = () => {
      // Intentionally empty - suppresses test output
    };
    // eslint-disable-next-line no-empty-function
    console.warn = () => {
      // Intentionally empty - suppresses test output
    };
    // eslint-disable-next-line no-empty-function
    console.info = () => {
      // Intentionally empty - suppresses test output
    };
  }
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

beforeEach(() => {
  // Reset any test-specific state
  // Intentionally empty - placeholder for future test state management
});

afterEach(() => {
  // Cleanup after each test
  // Intentionally empty - placeholder for future test cleanup
});
