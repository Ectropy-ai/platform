/**
 * ENTERPRISE TEST SETUP - OAuth Library
 *
 * Purpose: Configure test environment for OAuth provider unit tests
 * Framework: Vitest
 *
 * ENTERPRISE STANDARDS:
 * - Mock external dependencies (Prisma, fetch, crypto)
 * - Provide consistent test utilities
 * - Enable isolated, repeatable tests
 */

import { vi, beforeEach } from 'vitest';

// Mock the logger
vi.mock('@ectropy/shared/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Prisma Client
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    user: {
      upsert: vi.fn().mockResolvedValue({
        id: 'db-user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        picture: null,
        provider: 'google',
        provider_id: 'google-123',
        role: 'user',
        last_login: new Date(),
      }),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  })),
}));

// Global test lifecycle hooks
beforeEach(() => {
  // Clear all mock call history before each test (keeps implementations)
  vi.clearAllMocks();

  // Reset environment variables
  delete process.env.AUTHORIZED_USERS;
  delete process.env.AUTHORIZED_EMAILS;
  delete process.env.FRONTEND_URL;
  process.env.NODE_ENV = 'test';
});

// Export mock utilities for use in test files
export { vi };
