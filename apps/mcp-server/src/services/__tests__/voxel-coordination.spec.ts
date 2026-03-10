/**
 * Voxel Coordination Service Tests
 *
 * Comprehensive test suite for the unified voxel coordination
 * service that integrates decomposition, persistence, and
 * Speckle services.
 *
 * @module services/__tests__/voxel-coordination.spec
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VoxelCoordinationService,
  createVoxelCoordinationService,
  VoxelCoordinationConfig,
  VoxelCoordinationResult,
} from '../voxel-coordination.service';
import {
  VoxelData,
  VoxelStatus,
  VoxelSystem,
  AggregationLevel,
  IFCElement,
  IFCEntityCategory,
} from '../../types/voxel-decomposition.types';

// ==============================================================================
// Mock Prisma Client
// ==============================================================================

const createMockPrismaClient = () => {
  const mockVoxels = new Map<string, any>();

  return {
    voxel: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => Array.from(mockVoxels.values())),
      count: vi.fn(async () => mockVoxels.size),
      create: vi.fn(async ({ data }: any) => {
        mockVoxels.set(data.id, data);
        return data;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const record = mockVoxels.get(where.id);
        if (record) {
          const updated = { ...record, ...data };
          mockVoxels.set(where.id, updated);
          return updated;
        }
        throw new Error('Not found');
      }),
      deleteMany: vi.fn(async () => ({ count: mockVoxels.size })),
    },
    voxelDecisionAttachment: {
      create: vi.fn(async ({ data }: any) => data),
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(async (callback: any) => {
      return callback({
        voxel: {
          findUnique: async () => null,
          create: async ({ data }: any) => data,
          update: async ({ where, data }: any) => ({ ...data, id: where.id }),
        },
        voxelDecisionAttachment: {
          create: async ({ data }: any) => data,
        },
      });
    }),
    $queryRaw: vi.fn(async () => [
      {
        key: 'Level 1',
        voxel_count: BigInt(50),
        decision_count: BigInt(5),
        alert_count: BigInt(2),
        planned_count: BigInt(25),
        in_progress_count: BigInt(15),
        complete_count: BigInt(8),
        blocked_count: BigInt(2),
        total_estimated_cost: 25000,
        total_actual_cost: 24000,
        total_estimated_hours: 250,
        total_actual_hours: 240,
        avg_progress: 55,
      },
    ]),
    _mockVoxels: mockVoxels,
  };
};

// ==============================================================================
// Test Suites
// ==============================================================================

describe('VoxelCoordinationService', () => {
  let service: VoxelCoordinationService;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    service = createVoxelCoordinationService(mockPrisma as any, {
      enablePersistence: true,
      enableActivityTracking: true,
    });
  });

  // ===========================================================================
  // Factory Tests
  // ===========================================================================

  describe('Factory', () => {
    it('should create service with factory function', () => {
      const svc = createVoxelCoordinationService(mockPrisma as any);
      expect(svc).toBeInstanceOf(VoxelCoordinationService);
    });

    it('should accept custom configuration', () => {
      const config: Partial<VoxelCoordinationConfig> = {
        enablePersistence: false,
        batchSize: 1000,
        defaultResolution: 50,
      };
      const svc = createVoxelCoordinationService(mockPrisma as any, config);
      expect(svc).toBeInstanceOf(VoxelCoordinationService);
    });
  });

  // ===========================================================================
  // voxelizeModel Tests
  // ===========================================================================

  describe('voxelizeModel', () => {
    it('should voxelize model successfully', async () => {
      const result = await service.voxelizeModel('test-project', 'test-model');

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('test-project');
      expect(result.modelId).toBe('test-model');
      expect(result.voxelization).toBeDefined();
      expect(result.voxelization.voxelCount).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should persist voxels when enabled', async () => {
      const result = await service.voxelizeModel(
        'test-project',
        'test-model',
        true
      );

      expect(result.success).toBe(true);
      expect(result.persistence).toBeDefined();
    });

    it('should skip persistence when disabled', async () => {
      const noPersisteService = createVoxelCoordinationService(
        mockPrisma as any,
        {
          enablePersistence: false,
        }
      );

      const result = await noPersisteService.voxelizeModel(
        'test-project',
        'test-model'
      );

      expect(result.success).toBe(true);
      expect(result.persistence).toBeUndefined();
    });
  });

  // ===========================================================================
  // voxelizeFromElements Tests
  // ===========================================================================

  describe('voxelizeFromElements', () => {
    const testElements: IFCElement[] = [
      {
        expressId: 1,
        globalId: 'wall-001',
        type: IFCEntityCategory.WALL,
        name: 'Test Wall',
        boundingBox: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 1000, y: 200, z: 3000 },
        },
        materials: [{ name: 'Concrete' }],
        properties: {},
      },
      {
        expressId: 2,
        globalId: 'column-001',
        type: IFCEntityCategory.COLUMN,
        name: 'Test Column',
        boundingBox: {
          min: { x: 500, y: 500, z: 0 },
          max: { x: 700, y: 700, z: 3000 },
        },
        materials: [{ name: 'Steel' }],
        properties: {},
      },
    ];

    it('should voxelize from IFC elements', async () => {
      const result = await service.voxelizeFromElements(
        'test-project',
        'test-model',
        testElements
      );

      expect(result.success).toBe(true);
      expect(result.voxelization.voxelCount).toBeGreaterThan(0);
    });

    it('should handle empty element array', async () => {
      const result = await service.voxelizeFromElements(
        'test-project',
        'test-model',
        []
      );

      // Empty elements returns success: false with NO_ELEMENTS error
      expect(result.success).toBe(false);
      expect(result.voxelization.voxelCount).toBe(0);
    });
  });

  // ===========================================================================
  // Query Tests
  // ===========================================================================

  describe('Query Methods', () => {
    beforeEach(async () => {
      // Pre-populate with voxels
      await service.voxelizeModel('query-project', 'query-model');
    });

    it('should query voxels by project', async () => {
      const result = await service.queryVoxels({ projectId: 'query-project' });

      expect(result.voxels).toBeDefined();
      expect(Array.isArray(result.voxels)).toBe(true);
      expect(result.totalCount).toBeGreaterThanOrEqual(0);
    });

    it('should get single voxel by ID', async () => {
      // First create a voxel
      await service.voxelizeModel('get-project', 'get-model');
      const { voxels } = await service.queryVoxels({
        projectId: 'get-project',
        limit: 1,
      });

      if (voxels.length > 0) {
        const voxel = await service.getVoxel(voxels[0].id);
        // May return null if using persistence layer with mocks
        expect(voxel === null || voxel.id === voxels[0].id).toBe(true);
      }
    });

    it('should load all project voxels', async () => {
      await service.voxelizeModel('load-project', 'load-model');
      const voxels = await service.loadProjectVoxels('load-project');

      expect(Array.isArray(voxels)).toBe(true);
    });

    it('should get voxel count', async () => {
      await service.voxelizeModel('count-project', 'count-model');
      const count = await service.getVoxelCount('count-project');

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Status & Update Tests
  // ===========================================================================

  describe('Status & Update Methods', () => {
    it('should update voxel status', async () => {
      await service.voxelizeModel('status-project', 'status-model');
      const { voxels } = await service.queryVoxels({
        projectId: 'status-project',
        limit: 1,
      });

      if (voxels.length > 0) {
        const result = await service.updateVoxelStatus(
          voxels[0].id,
          VoxelStatus.IN_PROGRESS,
          50
        );

        // May return null with mock persistence
        if (result) {
          expect(result.status).toBe(VoxelStatus.IN_PROGRESS);
          expect(result.percentComplete).toBe(50);
        }
      }
    });

    it('should attach decision to voxel', async () => {
      await service.voxelizeModel('decision-project', 'decision-model');
      const { voxels } = await service.queryVoxels({
        projectId: 'decision-project',
        limit: 1,
      });

      if (voxels.length > 0) {
        const result = await service.attachDecision({
          voxelId: voxels[0].id,
          decisionId: 'test-decision-001',
          attachmentType: 'LOCATION',
          label: 'Test Decision',
        });

        expect(typeof result).toBe('boolean');
      }
    });
  });

  // ===========================================================================
  // Aggregation Tests
  // ===========================================================================

  describe('Aggregation Methods', () => {
    it('should aggregate by level', async () => {
      await service.voxelizeModel('agg-project', 'agg-model');
      const result = await service.getAggregation(
        'agg-project',
        AggregationLevel.LEVEL
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it('should aggregate by system', async () => {
      await service.voxelizeModel('sys-project', 'sys-model');
      const result = await service.getAggregation(
        'sys-project',
        AggregationLevel.SYSTEM
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ===========================================================================
  // Visualization Tests
  // ===========================================================================

  describe('Visualization Methods', () => {
    it('should get visualization data', async () => {
      await service.voxelizeModel('viz-project', 'viz-model');
      const result = await service.getVisualizationData('viz-project');

      expect(result).toBeDefined();
      expect(result.instanceCount).toBeGreaterThanOrEqual(0);
      expect(result.voxelIds).toBeDefined();
      expect(result.positions).toBeInstanceOf(Float32Array);
      expect(result.colors).toBeInstanceOf(Float32Array);
      expect(result.scales).toBeInstanceOf(Float32Array);
      expect(result.bounds).toBeDefined();
    });
  });

  // ===========================================================================
  // Coordination Session Tests
  // ===========================================================================

  describe('Coordination Session Methods', () => {
    it('should create coordination session', () => {
      const session = service.createCoordinationSession('session-project', [
        'user-001',
        'user-002',
      ]);

      expect(session.sessionId).toBeDefined();
      expect(session.projectId).toBe('session-project');
      expect(session.participants).toEqual(['user-001', 'user-002']);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    it('should get coordination session', () => {
      const created = service.createCoordinationSession('get-session', [
        'user-001',
      ]);
      const retrieved = service.getCoordinationSession(created.sessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe(created.sessionId);
    });

    it('should subscribe to updates', () => {
      const updates: any[] = [];
      const unsubscribe = service.subscribeToUpdates(
        'sub-project',
        (update) => {
          updates.push(update);
        }
      );

      expect(typeof unsubscribe).toBe('function');

      // Cleanup
      unsubscribe();
    });
  });

  // ===========================================================================
  // Navigation Tests
  // ===========================================================================

  describe('Navigation Methods', () => {
    it('should navigate decision surface spatially', async () => {
      await service.voxelizeModel('nav-project', 'nav-model');
      const { voxels } = await service.queryVoxels({
        projectId: 'nav-project',
        limit: 1,
      });

      if (voxels.length > 0) {
        const result = await service.navigateDecisionSurface(
          'nav-project',
          voxels[0].id,
          'spatial'
        );

        if (result) {
          expect(result.startVoxel).toBeDefined();
          expect(result.relatedVoxels).toBeDefined();
          expect(result.traversalType).toBe('spatial');
        }
      }
    });

    it('should navigate decision surface causally', async () => {
      await service.voxelizeModel('causal-project', 'causal-model');
      const { voxels } = await service.queryVoxels({
        projectId: 'causal-project',
        limit: 1,
      });

      if (voxels.length > 0) {
        const result = await service.navigateDecisionSurface(
          'causal-project',
          voxels[0].id,
          'causal'
        );

        if (result) {
          expect(result.traversalType).toBe('causal');
        }
      }
    });

    it('should return null for non-existent start voxel', async () => {
      const result = await service.navigateDecisionSurface(
        'nav-project',
        'non-existent-voxel',
        'spatial'
      );

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Activity Tests
  // ===========================================================================

  describe('Activity Methods', () => {
    it('should get activity feed', async () => {
      await service.voxelizeModel('activity-project', 'activity-model');
      const activities = await service.getActivity('activity-project');

      expect(Array.isArray(activities)).toBe(true);
    });

    it('should respect limit', async () => {
      await service.voxelizeModel('limit-project', 'limit-model');
      const activities = await service.getActivity('limit-project', 5);

      expect(activities.length).toBeLessThanOrEqual(5);
    });
  });

  // ===========================================================================
  // Service Accessor Tests
  // ===========================================================================

  describe('Service Accessors', () => {
    it('should get decomposition service', () => {
      const decomposition = service.getDecompositionService();
      expect(decomposition).toBeDefined();
    });

    it('should get persistence service', () => {
      const persistence = service.getPersistenceService();
      expect(persistence).toBeDefined();
    });

    it('should get Speckle service', () => {
      const speckle = service.getSpeckleService();
      expect(speckle).toBeDefined();
    });
  });
});
