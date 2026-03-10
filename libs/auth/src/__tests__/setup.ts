/**
 * ENTERPRISE TEST SETUP - Auth Library
 *
 * Purpose: Configure test environment for auth library unit tests
 * Framework: Vitest
 *
 * ENTERPRISE STANDARDS:
 * - Mock external dependencies (database, cache, logging)
 * - Provide consistent test utilities
 * - Enable isolated, repeatable tests
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Mock the logger to prevent console output during tests
vi.mock('@ectropy/shared/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the Express types augmentation (empty module, just for type augmentation)
vi.mock('@ectropy/shared/types/express', () => ({}));

// Mock uuid with a deterministic value for predictable session IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-session-uuid-12345'),
}));

// Global test lifecycle hooks
beforeEach(() => {
  // Clear all mock call history before each test (keeps implementations)
  vi.clearAllMocks();
});

// Note: We intentionally don't use vi.resetAllMocks() as it resets
// mock implementations (like uuid.v4) which breaks tests

// Export mock utilities for use in test files
export { vi };
