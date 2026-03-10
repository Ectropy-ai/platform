/**
 * Enterprise Unit Tests - SpeckleIntegrationService
 *
 * CRITICAL: Speckle powers the 3D BIM viewer after IFC upload
 * Tests align with actual SpeckleIntegrationService implementation
 *
 * Note: Full integration tests are in tests/integration/speckle-integration/
 * These unit tests focus on interface compliance, input validation, and
 * service structure without requiring database/API mocking.
 */

import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeckleIntegrationService } from '@ectropy/speckle-integration';
import type { SpeckleConfig } from '@ectropy/speckle-integration';

describe('SpeckleIntegrationService - Enterprise Unit Tests', () => {
  let speckleService: SpeckleIntegrationService;
  let mockDb: any;
  let mockConfig: SpeckleConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock database that returns proper results for all queries
    mockDb = {
      query: vi.fn().mockImplementation((query: string, params?: any[]) => {
        // Project lookup
        if (query.includes('SELECT name FROM projects')) {
          return Promise.resolve({ rows: [{ name: 'Test Project' }] });
        }
        // Stream lookup
        if (query.includes('SELECT stream_id FROM speckle_streams')) {
          return Promise.resolve({ rows: [{ stream_id: 'stream-123' }] });
        }
        // Sync log creation
        if (query.includes('INSERT INTO speckle_sync_log')) {
          return Promise.resolve({ rows: [{ id: 'sync-log-123' }] });
        }
        // Stream insert
        if (query.includes('INSERT INTO speckle_streams')) {
          return Promise.resolve({ rows: [{ id: 'stream-123' }] });
        }
        // Element queries
        if (query.includes('SELECT') && query.includes('construction_elements')) {
          return Promise.resolve({ rows: [] });
        }
        // Delete queries
        if (query.includes('DELETE')) {
          return Promise.resolve({ rowCount: 1 });
        }
        // Update sync log
        if (query.includes('UPDATE speckle_sync_log')) {
          return Promise.resolve({ rowCount: 1 });
        }
        // Default
        return Promise.resolve({ rows: [] });
      }),
    };

    // Setup mock config
    mockConfig = {
      serverUrl: 'https://speckle.example.com',
      token: 'test-token-123',
      defaultBranchName: 'main',
    };

    // Initialize service
    speckleService = new SpeckleIntegrationService(mockDb, mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
    speckleService.removeAllListeners();
  });

  describe('Service Initialization', () => {
    it('should initialize service correctly', () => {
      expect(speckleService).toBeDefined();
      expect(speckleService).toBeInstanceOf(SpeckleIntegrationService);
      expect(speckleService).toBeInstanceOf(EventEmitter);
    });

    it('should have all required public methods', () => {
      expect(typeof speckleService.initializeProject).toBe('function');
      expect(typeof speckleService.importIFCFile).toBe('function');
      expect(typeof speckleService.exportElementsToSpeckle).toBe('function');
      expect(typeof speckleService.getProjectStreams).toBe('function');
      expect(typeof speckleService.getStream).toBe('function');
      expect(typeof speckleService.deleteProjectStream).toBe('function');
      expect(typeof speckleService.setIFCProcessor).toBe('function');
    });

    it('should expose streams and sync service getters', () => {
      expect(speckleService.streams).toBeDefined();
      expect(speckleService.sync).toBeDefined();
    });

    it('should be an EventEmitter for progress updates', () => {
      const handler = vi.fn();
      speckleService.on('test-event', handler);
      speckleService.emit('test-event', { data: 'test' });
      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });
  });

  describe('Input Validation - Zod Schema Enforcement', () => {
    it('should reject empty project ID for initializeProject', async () => {
      await expect(speckleService.initializeProject('')).rejects.toThrow();
    });

    it('should reject empty project ID for importIFCFile', async () => {
      await expect(
        speckleService.importIFCFile('', '/path/to/file.ifc')
      ).rejects.toThrow();
    });

    it('should reject empty file path for importIFCFile', async () => {
      await expect(
        speckleService.importIFCFile('project-123', '')
      ).rejects.toThrow();
    });

    it('should reject empty project ID for exportElementsToSpeckle', async () => {
      await expect(
        speckleService.exportElementsToSpeckle('')
      ).rejects.toThrow();
    });

    it('should reject empty project ID for getProjectStreams', async () => {
      await expect(speckleService.getProjectStreams('')).rejects.toThrow();
    });

    it('should reject empty project ID for deleteProjectStream', async () => {
      await expect(speckleService.deleteProjectStream('')).rejects.toThrow();
    });
  });

  describe('Error Handling - Project Not Found', () => {
    it('should throw error when project not found in initializeProject', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // No project found

      await expect(
        speckleService.initializeProject('nonexistent-project')
      ).rejects.toThrow('Construction project nonexistent-project not found');
    });

    it('should emit error event when project not found', async () => {
      const errorHandler = vi.fn();
      speckleService.on('error', errorHandler);

      mockDb.query.mockResolvedValueOnce({ rows: [] }); // No project found

      try {
        await speckleService.initializeProject('nonexistent');
      } catch {
        // Expected
      }

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Stream Operations', () => {
    it('should throw error when no stream exists for exportElementsToSpeckle', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // No stream

      await expect(
        speckleService.exportElementsToSpeckle('project-without-stream')
      ).rejects.toThrow('No Speckle stream found for project project-without-stream');
    });

    it('should return true for deleteProjectStream when no stream exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // No stream

      const result = await speckleService.deleteProjectStream('project-no-stream');
      expect(result).toBe(true);
    });
  });

  describe('setIFCProcessor() - IFC Processor Integration', () => {
    it('should set IFC processor without throwing', () => {
      const mockProcessor = {
        parseIFCFile: vi.fn(),
      };

      expect(() => speckleService.setIFCProcessor(mockProcessor)).not.toThrow();
    });

    it('should accept processor without parseIFCFile method', () => {
      const mockProcessor = {};

      expect(() => speckleService.setIFCProcessor(mockProcessor)).not.toThrow();
    });

    it('should log when IFC processor is attached', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      speckleService.setIFCProcessor({ parseIFCFile: vi.fn() });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('IFC processor attached')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('SpeckleConfig Interface', () => {
    it('should accept valid config with all required fields', () => {
      const validConfig: SpeckleConfig = {
        serverUrl: 'https://speckle.example.com',
        token: 'valid-token',
        defaultBranchName: 'main',
      };

      expect(() => new SpeckleIntegrationService(mockDb, validConfig)).not.toThrow();
    });

    it('should create service with different branch names', () => {
      const configWithCustomBranch: SpeckleConfig = {
        serverUrl: 'https://speckle.example.com',
        token: 'valid-token',
        defaultBranchName: 'develop',
      };

      const service = new SpeckleIntegrationService(mockDb, configWithCustomBranch);
      expect(service).toBeDefined();
    });
  });

  describe('Child Service Access', () => {
    it('should provide access to stream service via getter', () => {
      const streamService = speckleService.streams;
      expect(streamService).toBeDefined();
      expect(typeof streamService.createStream).toBe('function');
      expect(typeof streamService.getStream).toBe('function');
      expect(typeof streamService.deleteStream).toBe('function');
    });

    it('should provide access to sync service via getter', () => {
      const syncService = speckleService.sync;
      expect(syncService).toBeDefined();
      expect(typeof syncService.importIFCToSpeckle).toBe('function');
      expect(typeof syncService.exportElementsToSpeckle).toBe('function');
    });
  });

  describe('Event Forwarding', () => {
    it('should forward error events from child services', () => {
      const errorHandler = vi.fn();
      speckleService.on('error', errorHandler);

      // Trigger error event from stream service
      speckleService.streams.emit('error', new Error('Stream error'));

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should forward streamCreated events', () => {
      const handler = vi.fn();
      speckleService.on('streamCreated', handler);

      speckleService.streams.emit('streamCreated', { streamId: 'new-stream' });

      expect(handler).toHaveBeenCalledWith({ streamId: 'new-stream' });
    });

    it('should forward importCompleted events', () => {
      const handler = vi.fn();
      speckleService.on('importCompleted', handler);

      speckleService.sync.emit('importCompleted', { elementsImported: 45 });

      expect(handler).toHaveBeenCalledWith({ elementsImported: 45 });
    });

    it('should forward exportCompleted events', () => {
      const handler = vi.fn();
      speckleService.on('exportCompleted', handler);

      speckleService.sync.emit('exportCompleted', { elementsExported: 30 });

      expect(handler).toHaveBeenCalledWith({ elementsExported: 30 });
    });
  });
});
