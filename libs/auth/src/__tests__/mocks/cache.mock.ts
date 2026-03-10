/**
 * ENTERPRISE MOCK - Cache Client (Redis)
 *
 * Purpose: Provide a mock cache client for unit testing
 * Pattern: In-memory cache simulation with TTL support
 *
 * ENTERPRISE STANDARDS:
 * - Type-safe mock implementation
 * - TTL tracking for session expiration tests
 * - Operation history for assertions
 */

import { vi } from 'vitest';
import type { CacheClient } from '../../services/interfaces.js';

export interface CacheEntry {
  value: any;
  ttl?: number;
  expiresAt?: Date;
}

export interface CacheOperation {
  operation: 'get' | 'set' | 'delete' | 'keys';
  key?: string;
  pattern?: string;
  value?: any;
  ttl?: number;
  timestamp: Date;
}

export interface MockCacheConfig {
  /** Initial cache data */
  initialData?: Map<string, CacheEntry>;
  /** Whether operations should throw errors */
  shouldThrow?: boolean;
  /** Error to throw if shouldThrow is true */
  errorToThrow?: Error;
}

/**
 * Creates a mock cache client with in-memory storage
 */
export function createMockCacheClient(
  config: MockCacheConfig = {}
): CacheClient & {
  _store: Map<string, CacheEntry>;
  _operationHistory: CacheOperation[];
  _setData: (key: string, value: any, ttl?: number) => void;
  _getData: (key: string) => any;
  _reset: () => void;
  _simulateExpiration: (key: string) => void;
} {
  const store = config.initialData || new Map<string, CacheEntry>();
  const operationHistory: CacheOperation[] = [];

  const mockCache: CacheClient & {
    _store: Map<string, CacheEntry>;
    _operationHistory: CacheOperation[];
    _setData: (key: string, value: any, ttl?: number) => void;
    _getData: (key: string) => any;
    _reset: () => void;
    _simulateExpiration: (key: string) => void;
  } = {
    _store: store,
    _operationHistory: operationHistory,

    _setData(key: string, value: any, ttl?: number) {
      const entry: CacheEntry = { value };
      if (ttl) {
        entry.ttl = ttl;
        entry.expiresAt = new Date(Date.now() + ttl * 1000);
      }
      store.set(key, entry);
    },

    _getData(key: string) {
      const entry = store.get(key);
      return entry?.value;
    },

    _reset() {
      store.clear();
      operationHistory.length = 0;
    },

    _simulateExpiration(key: string) {
      store.delete(key);
    },

    get: vi.fn(async <T = any>(key: string): Promise<T | null> => {
      operationHistory.push({
        operation: 'get',
        key,
        timestamp: new Date(),
      });

      if (config.shouldThrow) {
        throw config.errorToThrow || new Error('Cache error');
      }

      const entry = store.get(key);
      if (!entry) {
        return null;
      }

      // Check if expired
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        store.delete(key);
        return null;
      }

      return entry.value as T;
    }),

    set: vi.fn(async (key: string, value: any, ttl?: number): Promise<void> => {
      operationHistory.push({
        operation: 'set',
        key,
        value,
        ttl,
        timestamp: new Date(),
      });

      if (config.shouldThrow) {
        throw config.errorToThrow || new Error('Cache error');
      }

      const entry: CacheEntry = { value };
      if (ttl) {
        entry.ttl = ttl;
        entry.expiresAt = new Date(Date.now() + ttl * 1000);
      }
      store.set(key, entry);
    }),

    delete: vi.fn(async (key: string): Promise<boolean> => {
      operationHistory.push({
        operation: 'delete',
        key,
        timestamp: new Date(),
      });

      if (config.shouldThrow) {
        throw config.errorToThrow || new Error('Cache error');
      }

      const existed = store.has(key);
      store.delete(key);
      return existed;
    }),

    del: vi.fn(async (key: string): Promise<void> => {
      operationHistory.push({
        operation: 'delete',
        key,
        timestamp: new Date(),
      });

      if (config.shouldThrow) {
        throw config.errorToThrow || new Error('Cache error');
      }

      store.delete(key);
    }),

    keys: vi.fn(async (pattern: string): Promise<string[]> => {
      operationHistory.push({
        operation: 'keys',
        pattern,
        timestamp: new Date(),
      });

      if (config.shouldThrow) {
        throw config.errorToThrow || new Error('Cache error');
      }

      // Simple pattern matching (supports * wildcard)
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*') + '$'
      );

      const matchingKeys: string[] = [];
      for (const key of store.keys()) {
        if (regex.test(key)) {
          // Check if not expired
          const entry = store.get(key);
          if (!entry?.expiresAt || entry.expiresAt >= new Date()) {
            matchingKeys.push(key);
          }
        }
      }

      return matchingKeys;
    }),
  };

  return mockCache;
}

/**
 * Creates a mock session data object
 */
export function createMockSessionData(overrides: Partial<{
  sessionId: string;
  userId: string;
  email: string;
  roles: string[];
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
}> = {}) {
  return {
    sessionId: overrides.sessionId || 'session-123',
    userId: overrides.userId || 'user-123',
    email: overrides.email || 'test@example.com',
    roles: overrides.roles || ['user'],
    lastActivity: overrides.lastActivity || new Date(),
    ipAddress: overrides.ipAddress,
    userAgent: overrides.userAgent,
  };
}
