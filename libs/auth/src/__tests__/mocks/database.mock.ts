/**
 * ENTERPRISE MOCK - Database Client
 *
 * Purpose: Provide a mock database client for unit testing
 * Pattern: Mock factory pattern with configurable behavior
 *
 * ENTERPRISE STANDARDS:
 * - Type-safe mock implementation
 * - Configurable return values per test
 * - Query history tracking for assertions
 */

import { vi } from 'vitest';
import type { DatabaseClient } from '../../services/interfaces.js';

export interface MockDatabaseConfig {
  /** Default query result to return */
  defaultResult?: { rows: any[] };
  /** Map of SQL patterns to results */
  queryResults?: Map<string, { rows: any[] }>;
  /** Whether queries should throw errors */
  shouldThrow?: boolean;
  /** Error to throw if shouldThrow is true */
  errorToThrow?: Error;
}

export interface QueryCall {
  sql: string;
  params: any[];
  timestamp: Date;
}

/**
 * Creates a mock database client with configurable behavior
 */
export function createMockDatabaseClient(
  config: MockDatabaseConfig = {}
): DatabaseClient & {
  _queryHistory: QueryCall[];
  _setQueryResult: (pattern: string, result: { rows: any[] }) => void;
  _reset: () => void;
} {
  const queryHistory: QueryCall[] = [];
  const queryResults = config.queryResults || new Map<string, { rows: any[] }>();

  const mockDb: DatabaseClient & {
    _queryHistory: QueryCall[];
    _setQueryResult: (pattern: string, result: { rows: any[] }) => void;
    _reset: () => void;
  } = {
    _queryHistory: queryHistory,

    _setQueryResult(pattern: string, result: { rows: any[] }) {
      queryResults.set(pattern, result);
    },

    _reset() {
      queryHistory.length = 0;
      queryResults.clear();
    },

    query: vi.fn(async <T = any>(sql: string, params: any[] = []): Promise<{ rows: T[] }> => {
      // Record the query
      queryHistory.push({ sql, params, timestamp: new Date() });

      // Check if should throw
      if (config.shouldThrow) {
        throw config.errorToThrow || new Error('Database error');
      }

      // Check for matching query result
      for (const [pattern, result] of queryResults.entries()) {
        if (sql.includes(pattern)) {
          return result as { rows: T[] };
        }
      }

      // Return default result
      return (config.defaultResult || { rows: [] }) as { rows: T[] };
    }),

    findUserByEmail: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  };

  return mockDb;
}

/**
 * Creates a mock user record as returned from database
 */
export function createMockUserRecord(overrides: Partial<{
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  roles: string[];
  isActive: boolean;
  loginAttempts: number;
  lockoutUntil: Date | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: overrides.id || 'user-123',
    email: overrides.email || 'test@example.com',
    passwordHash: overrides.passwordHash || '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.qpf3K0L0A7hE9u', // 'password123'
    password_hash: overrides.passwordHash || '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.qpf3K0L0A7hE9u',
    firstName: overrides.firstName || 'Test',
    first_name: overrides.firstName || 'Test',
    lastName: overrides.lastName || 'User',
    last_name: overrides.lastName || 'User',
    roles: overrides.roles || ['user'],
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    is_active: overrides.isActive !== undefined ? overrides.isActive : true,
    loginAttempts: overrides.loginAttempts || 0,
    login_attempts: overrides.loginAttempts || 0,
    lockoutUntil: overrides.lockoutUntil || null,
    lockout_until: overrides.lockoutUntil || null,
    twoFactorEnabled: overrides.twoFactorEnabled || false,
    two_factor_enabled: overrides.twoFactorEnabled || false,
    createdAt: overrides.createdAt || new Date('2024-01-01'),
    created_at: overrides.createdAt || new Date('2024-01-01'),
    updatedAt: overrides.updatedAt || new Date('2024-01-01'),
    updated_at: overrides.updatedAt || new Date('2024-01-01'),
  };
}
