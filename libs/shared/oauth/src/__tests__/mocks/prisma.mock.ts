/**
 * ENTERPRISE MOCK - Prisma Client
 *
 * Purpose: Mock Prisma ORM for OAuth provider testing
 * Pattern: Chainable mock with operation tracking
 */

import { vi } from 'vitest';

export interface MockUser {
  id: string;
  email: string;
  full_name: string;
  picture: string | null;
  provider: string;
  provider_id: string;
  role: string | null;
  roles?: string[];
  last_login: Date;
  created_at: Date;
  updated_at: Date;
}

export interface MockPrismaConfig {
  /** Default user to return from queries */
  defaultUser?: MockUser;
  /** Whether operations should throw */
  shouldThrow?: boolean;
  /** Error to throw */
  errorToThrow?: Error;
}

/**
 * Creates a mock Prisma client for testing
 */
export function createMockPrismaClient(config: MockPrismaConfig = {}) {
  const operationHistory: { operation: string; args: any }[] = [];
  let userToReturn: MockUser | null = config.defaultUser || null;

  const mockClient = {
    _operationHistory: operationHistory,
    _setUserToReturn: (user: MockUser | null) => {
      userToReturn = user;
    },
    _reset: () => {
      operationHistory.length = 0;
      userToReturn = config.defaultUser || null;
    },

    user: {
      upsert: vi.fn(async (args: any) => {
        operationHistory.push({ operation: 'user.upsert', args });

        if (config.shouldThrow) {
          throw config.errorToThrow || new Error('Database error');
        }

        // Return the user with updated fields
        return userToReturn || {
          id: 'db-user-123',
          email: args.create?.email || args.update?.email || 'test@example.com',
          full_name: args.create?.full_name || args.update?.full_name || 'Test User',
          picture: args.create?.picture || args.update?.picture || null,
          provider: args.create?.provider || 'google',
          provider_id: args.create?.provider_id || 'provider-123',
          role: 'user',
          last_login: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        };
      }),

      findUnique: vi.fn(async (args: any) => {
        operationHistory.push({ operation: 'user.findUnique', args });

        if (config.shouldThrow) {
          throw config.errorToThrow || new Error('Database error');
        }

        return userToReturn;
      }),

      findFirst: vi.fn(async (args: any) => {
        operationHistory.push({ operation: 'user.findFirst', args });

        if (config.shouldThrow) {
          throw config.errorToThrow || new Error('Database error');
        }

        return userToReturn;
      }),
    },

    $connect: vi.fn(async () => {}),
    $disconnect: vi.fn(async () => {}),
  };

  return mockClient;
}

/**
 * Create a mock user record
 */
export function createMockUserRecord(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: overrides.id || 'db-user-123',
    email: overrides.email || 'test@example.com',
    full_name: overrides.full_name || 'Test User',
    picture: overrides.picture || null,
    provider: overrides.provider || 'google',
    provider_id: overrides.provider_id || 'provider-123',
    role: overrides.role || 'user',
    last_login: overrides.last_login || new Date(),
    created_at: overrides.created_at || new Date(),
    updated_at: overrides.updated_at || new Date(),
  };
}
