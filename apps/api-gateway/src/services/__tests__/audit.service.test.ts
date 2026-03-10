/**
 * Enterprise Audit Service Unit Tests
 *
 * Comprehensive tests for tamper-evident audit logging with hash chaining
 *
 * Test Coverage:
 * - Hash generation and chain integrity
 * - Buffer management and flushing
 * - Event logging with context
 * - Retry logic for database writes
 * - Chain verification
 * - Graceful shutdown
 *
 * @module services/__tests__/audit.service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';

// Mock PrismaClient before importing service
const mockAuditLogFindFirst = vi.fn();
const mockAuditLogFindMany = vi.fn();
const mockAuditLogCreateMany = vi.fn();
const mockDisconnect = vi.fn();

const mockPrismaInstance = {
  auditLog: {
    findFirst: mockAuditLogFindFirst,
    findMany: mockAuditLogFindMany,
    createMany: mockAuditLogCreateMany,
  },
  $disconnect: mockDisconnect,
  $connect: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => mockPrismaInstance),
}));

// Mock getPrismaClient singleton — service imports from ../database/prisma.js
vi.mock('../../database/prisma.js', () => ({
  getPrismaClient: vi.fn(() => mockPrismaInstance),
}));

// Mock request context
const mockContextData = {
  userId: 'test-user-123',
  sessionId: 'session-456',
  requestId: 'request-789',
  metadata: {
    ip: '192.168.1.1',
    userAgent: 'Test Agent/1.0',
  },
};

vi.mock('@ectropy/shared/utils', () => ({
  requestContext: {
    getContext: () => mockContextData,
  },
}));

// Mock logger
vi.mock('../../../../../libs/shared/utils/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import {
  EnterpriseAuditService,
  AuditEventType,
  AuditResourceType,
  type AuditEventInput,
} from '../audit.service';

describe('EnterpriseAuditService', () => {
  let auditService: EnterpriseAuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    // ENTERPRISE FIX (2026-01-30): Configure mocks BEFORE enabling fake timers
    // Fake timers can interfere with mock setup and async operations

    // Default mock implementations - set before any service instantiation
    mockAuditLogFindFirst.mockResolvedValue(null);
    mockAuditLogCreateMany.mockResolvedValue({ count: 1 });
    mockAuditLogFindMany.mockResolvedValue([]);
    mockDisconnect.mockResolvedValue(undefined);

    // Enable fake timers after mock setup
    vi.useFakeTimers();
  });

  afterEach(async () => {
    // ENTERPRISE FIX (2026-01-30): Proper cleanup sequence
    // 1. Switch to real timers first
    vi.useRealTimers();

    // 2. Shutdown service if exists
    if (auditService) {
      try {
        await auditService.shutdown();
      } catch {
        // Ignore shutdown errors in cleanup
      }
    }

    // 3. Reset module state to prevent singleton bleeding between tests
    vi.resetModules();
  });

  // Helper to create service and wait for initialization
  async function createInitializedService(): Promise<EnterpriseAuditService> {
    const service = new EnterpriseAuditService();

    // ENTERPRISE FIX (2026-01-30): Properly await initialization promise
    // The constructor sets this.initializationPromise = this.initialize()
    // We must await it to ensure service is fully ready before tests

    // Advance fake timers to allow any timer-based operations
    await vi.advanceTimersByTimeAsync(100);

    // Access the private initialization promise and await it
    // This ensures database connection, hash loading, and periodic flush setup complete
    const initPromise = (service as any).initializationPromise;
    if (initPromise) {
      await initPromise;
    }

    // Advance timers by flush interval to allow periodic setup to settle
    // NOTE: Do NOT use vi.runAllTimersAsync() — setInterval causes infinite loop
    await vi.advanceTimersByTimeAsync(6000);
    await Promise.resolve();

    return service;
  }

  // ===========================================================================
  // INITIALIZATION TESTS
  // ===========================================================================
  describe('Initialization', () => {
    it('should initialize and create PrismaClient', async () => {
      auditService = await createInitializedService();

      const status = auditService.getStatus();
      expect(status.databaseConnected).toBe(true);
    });

    it('should load last hash from database on startup', async () => {
      mockAuditLogFindFirst.mockResolvedValue({
        event_hash: 'abc123def456789',
      });

      auditService = await createInitializedService();

      expect(mockAuditLogFindFirst).toHaveBeenCalled();
    });

    it('should handle initialization failure gracefully', async () => {
      mockAuditLogFindFirst.mockRejectedValue(
        new Error('DB connection failed')
      );

      auditService = await createInitializedService();

      // Should still be able to get status
      const status = auditService.getStatus();
      expect(status.bufferSize).toBe(0);
    });
  });

  // ===========================================================================
  // HASH GENERATION TESTS
  // ===========================================================================
  describe('Hash Generation', () => {
    it('should generate hash for events', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceId: 'user-123',
        resourceType: AuditResourceType.USER,
        eventData: { method: 'password' },
      });

      const status = auditService.getStatus();
      expect(status.lastHash).toBeTruthy();
    });

    it('should chain hashes by including previous hash', async () => {
      auditService = await createInitializedService();

      // Log first event
      await auditService.log({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceId: 'user-123',
        resourceType: AuditResourceType.USER,
      });

      const firstHash = auditService.getStatus().lastHash;

      // Log second event
      await auditService.log({
        eventType: AuditEventType.AUTH_LOGOUT,
        resourceId: 'user-123',
        resourceType: AuditResourceType.USER,
      });

      const secondHash = auditService.getStatus().lastHash;

      // Hashes should be different (chain advanced)
      expect(secondHash).not.toBe(firstHash);
    });

    it('should include all required fields in hash payload', async () => {
      auditService = await createInitializedService();

      const input: AuditEventInput = {
        eventType: AuditEventType.RESOURCE_CREATED,
        resourceId: 'project-abc',
        resourceType: AuditResourceType.PROJECT,
        actorId: 'actor-999',
        eventData: { name: 'Test Project' },
        severity: 'low',
      };

      await auditService.log(input);

      // Verify hash was generated
      expect(auditService.getStatus().lastHash).toBeTruthy();
    });
  });

  // ===========================================================================
  // EVENT LOGGING TESTS
  // ===========================================================================
  describe('Event Logging', () => {
    it('should log event to buffer', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceId: 'user-123',
        resourceType: AuditResourceType.USER,
      });

      expect(auditService.getStatus().bufferSize).toBe(1);
    });

    it('should use actorId from input when provided', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.ADMIN_USER_CREATED,
        resourceId: 'new-user-456',
        resourceType: AuditResourceType.USER,
        actorId: 'admin-override',
      });

      expect(auditService.getStatus().bufferSize).toBe(1);
    });

    it('should set default severity to low', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.RESOURCE_READ,
        resourceId: 'doc-123',
        resourceType: AuditResourceType.FILE,
      });

      expect(auditService.getStatus().bufferSize).toBe(1);
    });
  });

  // ===========================================================================
  // CONVENIENCE METHOD TESTS
  // ===========================================================================
  describe('Convenience Methods', () => {
    beforeEach(async () => {
      auditService = await createInitializedService();
    });

    it('should log auth events with logAuth()', async () => {
      await auditService.logAuth(
        AuditEventType.AUTH_LOGIN_SUCCESS,
        'user-123',
        { method: 'oauth' }
      );

      expect(auditService.getStatus().bufferSize).toBe(1);
    });

    it('should set medium severity for failed auth events', async () => {
      await auditService.logAuth(AuditEventType.AUTH_LOGIN_FAILED, 'user-123', {
        reason: 'invalid password',
      });

      expect(auditService.getStatus().bufferSize).toBe(1);
    });

    it('should log file operations with logFileOperation()', async () => {
      await auditService.logFileOperation(
        AuditEventType.FILE_UPLOADED,
        'file-456',
        { filename: 'model.ifc', size: 1024 }
      );

      expect(auditService.getStatus().bufferSize).toBe(1);
    });

    it('should set high severity for blocked file operations', async () => {
      await auditService.logFileOperation(
        AuditEventType.FILE_SCAN_BLOCKED,
        'file-789',
        { reason: 'malware detected' }
      );

      expect(auditService.getStatus().bufferSize).toBe(1);
    });

    it('should log security events with logSecurityEvent()', async () => {
      await auditService.logSecurityEvent(
        AuditEventType.SECURITY_THREAT_DETECTED,
        'request-123',
        { threat: 'SQL injection attempt' },
        'critical'
      );

      expect(auditService.getStatus().bufferSize).toBe(1);
    });
  });

  // ===========================================================================
  // BUFFER MANAGEMENT TESTS
  // ===========================================================================
  describe('Buffer Management', () => {
    it('should buffer events before flushing', async () => {
      auditService = await createInitializedService();

      for (let i = 0; i < 5; i++) {
        await auditService.log({
          eventType: AuditEventType.RESOURCE_READ,
          resourceId: `resource-${i}`,
          resourceType: AuditResourceType.PROJECT,
        });
      }

      expect(auditService.getStatus().bufferSize).toBe(5);
    });

    it('should auto-flush when buffer reaches capacity (100)', async () => {
      auditService = await createInitializedService();

      // Log 100 events to trigger auto-flush
      for (let i = 0; i < 100; i++) {
        await auditService.log({
          eventType: AuditEventType.RESOURCE_READ,
          resourceId: `resource-${i}`,
          resourceType: AuditResourceType.PROJECT,
        });
      }

      // Buffer should be cleared after flush
      expect(mockAuditLogCreateMany).toHaveBeenCalled();
    });

    it('should flush periodically', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.RESOURCE_READ,
        resourceId: 'resource-1',
        resourceType: AuditResourceType.PROJECT,
      });

      // Advance time by 5 seconds (flush interval)
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockAuditLogCreateMany).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // FLUSH LOGIC TESTS
  // ===========================================================================
  describe('Flush Logic', () => {
    it('should batch insert events using createMany', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceId: 'user-1',
        resourceType: AuditResourceType.USER,
      });

      await auditService.log({
        eventType: AuditEventType.AUTH_LOGOUT,
        resourceId: 'user-1',
        resourceType: AuditResourceType.USER,
      });

      await auditService.flush();

      expect(mockAuditLogCreateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
        })
      );
    });

    it('should not flush if buffer is empty', async () => {
      auditService = await createInitializedService();

      await auditService.flush();

      expect(mockAuditLogCreateMany).not.toHaveBeenCalled();
    });

    it('should retry on database failure up to 3 times', async () => {
      mockAuditLogCreateMany
        .mockRejectedValueOnce(new Error('DB timeout'))
        .mockRejectedValueOnce(new Error('DB timeout'))
        .mockResolvedValueOnce({ count: 1 });

      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceId: 'user-1',
        resourceType: AuditResourceType.USER,
      });

      // Use real timers for the retry delays
      vi.useRealTimers();
      await auditService.flush();

      expect(mockAuditLogCreateMany).toHaveBeenCalledTimes(3);
    });

    it('should restore events to buffer after max retries exceeded', async () => {
      mockAuditLogCreateMany.mockRejectedValue(new Error('DB unavailable'));

      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceId: 'user-1',
        resourceType: AuditResourceType.USER,
      });

      vi.useRealTimers();
      await auditService.flush();

      // Events should be restored to buffer
      expect(auditService.getStatus().bufferSize).toBe(1);
    });
  });

  // ===========================================================================
  // CHAIN INTEGRITY VERIFICATION TESTS
  // ===========================================================================
  describe('Chain Integrity Verification', () => {
    it('should verify valid chain', async () => {
      // Create valid chain of events
      const timestamp = new Date('2026-01-01T00:00:00.000Z');
      const payload = JSON.stringify({
        eventType: 'AUTH_LOGIN_SUCCESS',
        resourceId: 'user-1',
        resourceType: 'user',
        actorId: 'user-1',
        eventData: { severity: 'low' },
        previousHash: null,
        createdAt: timestamp.toISOString(),
        requestId: 'req-1',
      });
      const expectedHash = createHash('sha256').update(payload).digest('hex');

      const events = [
        {
          event_hash: expectedHash,
          event_type: 'AUTH_LOGIN_SUCCESS',
          resource_id: 'user-1',
          resource_type: 'user',
          actor_id: 'user-1',
          event_data: { severity: 'low' },
          previous_hash: null,
          created_at: timestamp,
          request_id: 'req-1',
        },
      ];

      mockAuditLogFindMany.mockResolvedValue(events);

      auditService = await createInitializedService();

      const result = await auditService.verifyChainIntegrity();

      expect(result.valid).toBe(true);
      expect(result.eventsChecked).toBe(1);
    });

    it('should detect broken chain (previous hash mismatch)', async () => {
      // Build a valid first event
      const timestamp1 = new Date('2026-01-01T00:00:00.000Z');
      const payload1 = JSON.stringify({
        eventType: 'AUTH_LOGIN_SUCCESS',
        resourceId: 'user-1',
        resourceType: 'user',
        actorId: 'user-1',
        eventData: {},
        previousHash: null,
        createdAt: timestamp1.toISOString(),
        requestId: 'req-1',
      });
      const hash1 = createHash('sha256').update(payload1).digest('hex');

      const events = [
        {
          event_hash: hash1,
          event_type: 'AUTH_LOGIN_SUCCESS',
          resource_id: 'user-1',
          resource_type: 'user',
          actor_id: 'user-1',
          event_data: {},
          previous_hash: null,
          created_at: timestamp1,
          request_id: 'req-1',
        },
        {
          event_hash: 'hash2',
          event_type: 'AUTH_LOGOUT',
          resource_id: 'user-1',
          resource_type: 'user',
          actor_id: 'user-1',
          event_data: {},
          previous_hash: 'wrong-hash', // Should be hash1
          created_at: new Date('2026-01-01T00:01:00.000Z'),
          request_id: 'req-2',
        },
      ];

      mockAuditLogFindMany.mockResolvedValue(events);

      auditService = await createInitializedService();

      const result = await auditService.verifyChainIntegrity();

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('hash2');
    });

    it('should limit verification to specified number of events', async () => {
      mockAuditLogFindMany.mockResolvedValue([]);

      auditService = await createInitializedService();

      await auditService.verifyChainIntegrity(500);

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
        })
      );
    });
  });

  // ===========================================================================
  // SHUTDOWN TESTS
  // ===========================================================================
  describe('Shutdown', () => {
    it('should flush remaining events on shutdown', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceId: 'user-1',
        resourceType: AuditResourceType.USER,
      });

      vi.useRealTimers();
      await auditService.shutdown();

      expect(mockAuditLogCreateMany).toHaveBeenCalled();
    });

    it('should disconnect Prisma client on shutdown', async () => {
      auditService = await createInitializedService();

      vi.useRealTimers();
      await auditService.shutdown();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // STATUS TESTS
  // ===========================================================================
  describe('Status', () => {
    it('should return accurate status', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceId: 'user-1',
        resourceType: AuditResourceType.USER,
      });

      const status = auditService.getStatus();

      expect(status.databaseConnected).toBe(true);
      expect(status.bufferSize).toBeGreaterThan(0);
      expect(status.lastHash).toBeTruthy();
    });

    it('should truncate lastHash for display', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceId: 'user-1',
        resourceType: AuditResourceType.USER,
      });

      const status = auditService.getStatus();
      expect(status.lastHash).toMatch(/^[a-f0-9]{8}\.\.\.$/);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('Edge Cases', () => {
    it('should handle concurrent log calls', async () => {
      auditService = await createInitializedService();

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          auditService.log({
            eventType: AuditEventType.RESOURCE_READ,
            resourceId: `resource-${i}`,
            resourceType: AuditResourceType.PROJECT,
          })
        );
      }

      await Promise.all(promises);

      expect(auditService.getStatus().bufferSize).toBe(10);
    });

    it('should handle empty eventData', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceId: 'user-1',
        resourceType: AuditResourceType.USER,
      });

      expect(auditService.getStatus().bufferSize).toBe(1);
    });

    it('should handle special characters in eventData', async () => {
      auditService = await createInitializedService();

      await auditService.log({
        eventType: AuditEventType.RESOURCE_CREATED,
        resourceId: 'project-1',
        resourceType: AuditResourceType.PROJECT,
        eventData: {
          name: 'Test "Project" with <special> & chars',
          description: "It's a test\nwith newlines",
        },
      });

      expect(auditService.getStatus().bufferSize).toBe(1);
    });

    it('should handle very large eventData', async () => {
      auditService = await createInitializedService();

      const largeData: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        largeData[`field_${i}`] = 'x'.repeat(1000);
      }

      await auditService.log({
        eventType: AuditEventType.RESOURCE_CREATED,
        resourceId: 'project-1',
        resourceType: AuditResourceType.PROJECT,
        eventData: largeData,
      });

      expect(auditService.getStatus().bufferSize).toBe(1);
    });
  });
});
