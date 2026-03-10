/**
 * Voxel Persistence Service Tests
 *
 * Comprehensive test suite for enterprise-grade voxel persistence
 * using Prisma database operations.
 *
 * Tests cover:
 * - Batch upsert operations
 * - Spatial queries
 * - Status updates
 * - Decision attachments
 * - Aggregation queries
 * - Activity feeds
 *
 * @module services/__tests__/voxel-persistence.spec
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VoxelPersistenceService,
  createVoxelPersistenceService,
  VoxelPersistenceResult,
  DecisionAttachmentInput,
} from '../voxel-persistence.service';
import {
  VoxelData,
  VoxelStatus,
  VoxelSystem,
  VoxelHealthStatus,
  AggregationLevel,
  VoxelSpatialQuery,
} from '../../types/voxel-decomposition.types';

// ==============================================================================
// Mock Prisma Client
// ==============================================================================

const createMockPrismaClient = () => {
  const mockVoxels: Map<string, any> = new Map();
  const mockAttachments: any[] = [];

  return {
    voxel: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) {
          return mockVoxels.get(where.id) || null;
        }
        if (where.project_id_voxel_id) {
          const key = `${where.project_id_voxel_id.project_id}-${where.project_id_voxel_id.voxel_id}`;
          for (const [, v] of mockVoxels) {
            if (v.project_id === where.project_id_voxel_id.project_id &&
                v.voxel_id === where.project_id_voxel_id.voxel_id) {
              return v;
            }
          }
        }
        return null;
      }),
      findMany: vi.fn(async ({ where, take, skip, orderBy }: any = {}) => {
        let results = Array.from(mockVoxels.values());

        if (where?.project_id) {
          results = results.filter((v) => v.project_id === where.project_id);
        }
        if (where?.status?.in) {
          results = results.filter((v) => where.status.in.includes(v.status));
        }
        if (where?.system?.in) {
          results = results.filter((v) => where.system.in.includes(v.system));
        }
        if (where?.level?.in) {
          results = results.filter((v) => where.level.in.includes(v.level));
        }
        if (where?.coord_x) {
          if (where.coord_x.gte !== undefined) {
            results = results.filter((v) => v.coord_x >= where.coord_x.gte);
          }
          if (where.coord_x.lte !== undefined) {
            results = results.filter((v) => v.coord_x <= where.coord_x.lte);
          }
        }
        if (where?.coord_y) {
          if (where.coord_y.gte !== undefined) {
            results = results.filter((v) => v.coord_y >= where.coord_y.gte);
          }
          if (where.coord_y.lte !== undefined) {
            results = results.filter((v) => v.coord_y <= where.coord_y.lte);
          }
        }
        if (where?.coord_z) {
          if (where.coord_z.gte !== undefined) {
            results = results.filter((v) => v.coord_z >= where.coord_z.gte);
          }
          if (where.coord_z.lte !== undefined) {
            results = results.filter((v) => v.coord_z <= where.coord_z.lte);
          }
        }
        if (where?.decision_count !== undefined) {
          if (typeof where.decision_count === 'number') {
            results = results.filter((v) => v.decision_count === where.decision_count);
          } else if (where.decision_count.gt !== undefined) {
            results = results.filter((v) => v.decision_count > where.decision_count.gt);
          }
        }

        if (skip) results = results.slice(skip);
        if (take) results = results.slice(0, take);

        return results;
      }),
      count: vi.fn(async ({ where }: any = {}) => {
        let results = Array.from(mockVoxels.values());
        if (where?.project_id) {
          results = results.filter((v) => v.project_id === where.project_id);
        }
        return results.length;
      }),
      create: vi.fn(async ({ data }: any) => {
        const record = {
          ...data,
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockVoxels.set(data.id, record);
        return record;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const record = mockVoxels.get(where.id);
        if (!record) throw new Error('Record not found');
        const updated = { ...record, ...data, updated_at: new Date() };
        mockVoxels.set(where.id, updated);
        return updated;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        let count = 0;
        for (const [id, v] of mockVoxels) {
          if (v.project_id === where.project_id) {
            mockVoxels.delete(id);
            count++;
          }
        }
        return { count };
      }),
    },
    voxelDecisionAttachment: {
      create: vi.fn(async ({ data }: any) => {
        const attachment = {
          id: `att-${Date.now()}`,
          ...data,
          attached_at: new Date(),
        };
        mockAttachments.push(attachment);
        return attachment;
      }),
      findMany: vi.fn(async ({ where, take, orderBy, include }: any) => {
        return mockAttachments.slice(0, take || 50).map((att) => ({
          ...att,
          voxel: {
            voxel_id: 'VOX-001',
            coord_x: 100,
            coord_y: 100,
            coord_z: 100,
            resolution: 100,
          },
          decision: { title: 'Test Decision' },
        }));
      }),
    },
    $transaction: vi.fn(async (callback: any) => {
      // Execute transaction callback with mock client
      return callback({
        voxel: {
          findUnique: async ({ where }: any) => {
            if (where.project_id_voxel_id) {
              for (const [, v] of mockVoxels) {
                if (v.project_id === where.project_id_voxel_id.project_id &&
                    v.voxel_id === where.project_id_voxel_id.voxel_id) {
                  return v;
                }
              }
            }
            return null;
          },
          create: async ({ data }: any) => {
            const record = {
              ...data,
              project_id: data.project?.connect?.id,
              created_at: new Date(),
              updated_at: new Date(),
            };
            mockVoxels.set(data.id, record);
            return record;
          },
          update: async ({ where, data }: any) => {
            const record = mockVoxels.get(where.id);
            if (record) {
              const updated = { ...record, ...data, updated_at: new Date() };
              mockVoxels.set(where.id, updated);
              return updated;
            }
            throw new Error('Not found');
          },
        },
        voxelDecisionAttachment: {
          create: async ({ data }: any) => {
            mockAttachments.push({ id: `att-${Date.now()}`, ...data });
            return data;
          },
        },
      });
    }),
    $queryRaw: vi.fn(async () => [
      {
        key: 'Level 1',
        voxel_count: BigInt(100),
        decision_count: BigInt(5),
        alert_count: BigInt(2),
        planned_count: BigInt(50),
        in_progress_count: BigInt(30),
        complete_count: BigInt(15),
        blocked_count: BigInt(5),
        total_estimated_cost: 50000,
        total_actual_cost: 48000,
        total_estimated_hours: 500,
        total_actual_hours: 480,
        avg_progress: 60,
      },
      {
        key: 'Level 2',
        voxel_count: BigInt(80),
        decision_count: BigInt(3),
        alert_count: BigInt(1),
        planned_count: BigInt(40),
        in_progress_count: BigInt(25),
        complete_count: BigInt(10),
        blocked_count: BigInt(5),
        total_estimated_cost: 40000,
        total_actual_cost: 42000,
        total_estimated_hours: 400,
        total_actual_hours: 420,
        avg_progress: 45,
      },
    ]),
    _mockVoxels: mockVoxels,
    _mockAttachments: mockAttachments,
  };
};

// ==============================================================================
// Test Data Factories
// ==============================================================================

function createTestVoxel(overrides: Partial<VoxelData> = {}): VoxelData {
  const baseId = overrides.id || `vox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: baseId,
    urn: `urn:luhtech:test:voxel:${baseId}`,
    voxelId: overrides.voxelId || `VOX-L1-MECH-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
    projectId: overrides.projectId || 'test-project-001',
    coord: overrides.coord || { i: 1, j: 1, k: 1 },
    center: overrides.center || { x: 150, y: 150, z: 150 },
    bounds: overrides.bounds || {
      min: { x: 100, y: 100, z: 100 },
      max: { x: 200, y: 200, z: 200 },
    },
    resolution: overrides.resolution || 100,
    level: overrides.level || 'Level 1',
    zone: overrides.zone || 'Zone A',
    system: overrides.system || VoxelSystem.MECHANICAL,
    ifcElements: overrides.ifcElements || ['elem-001', 'elem-002'],
    primaryElement: overrides.primaryElement || 'elem-001',
    elementCount: overrides.elementCount || 2,
    status: overrides.status || VoxelStatus.PLANNED,
    healthStatus: overrides.healthStatus || VoxelHealthStatus.HEALTHY,
    percentComplete: overrides.percentComplete,
    decisionCount: overrides.decisionCount || 0,
    unacknowledgedCount: overrides.unacknowledgedCount || 0,
    isCriticalPath: overrides.isCriticalPath || false,
    estimatedCost: overrides.estimatedCost,
    actualCost: overrides.actualCost,
    estimatedHours: overrides.estimatedHours,
    actualHours: overrides.actualHours,
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
  };
}

// ==============================================================================
// Test Suites
// ==============================================================================

describe('VoxelPersistenceService', () => {
  let service: VoxelPersistenceService;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    service = createVoxelPersistenceService(mockPrisma as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Factory Tests
  // ===========================================================================

  describe('Factory', () => {
    it('should create service with factory function', () => {
      const svc = createVoxelPersistenceService(mockPrisma as any);
      expect(svc).toBeInstanceOf(VoxelPersistenceService);
    });
  });

  // ===========================================================================
  // persistVoxels Tests
  // ===========================================================================

  describe('persistVoxels', () => {
    it('should persist single voxel successfully', async () => {
      const voxel = createTestVoxel();

      const result = await service.persistVoxels('test-project-001', [voxel]);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should persist multiple voxels in batch', async () => {
      const voxels = Array.from({ length: 10 }, (_, i) =>
        createTestVoxel({
          id: `vox-batch-${i}`,
          voxelId: `VOX-BATCH-${i}`,
        })
      );

      const result = await service.persistVoxels('test-project-001', voxels);

      expect(result.success).toBe(true);
      expect(result.created).toBe(10);
      expect(result.updated).toBe(0);
    });

    it('should update existing voxels', async () => {
      const voxel = createTestVoxel({ id: 'existing-voxel' });

      // First persist
      await service.persistVoxels('test-project-001', [voxel]);

      // Second persist should update
      const updatedVoxel = { ...voxel, level: 'Level 2' };
      const result = await service.persistVoxels('test-project-001', [updatedVoxel]);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
    });

    it('should handle empty voxel array', async () => {
      const result = await service.persistVoxels('test-project-001', []);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
    });

    it('should process large batches efficiently', async () => {
      const voxels = Array.from({ length: 600 }, (_, i) =>
        createTestVoxel({
          id: `vox-large-${i}`,
          voxelId: `VOX-LARGE-${i}`,
        })
      );

      const result = await service.persistVoxels('test-project-001', voxels);

      expect(result.success).toBe(true);
      expect(result.created).toBe(600);
    });
  });

  // ===========================================================================
  // loadProjectVoxels Tests
  // ===========================================================================

  describe('loadProjectVoxels', () => {
    it('should load voxels for project', async () => {
      // Pre-populate mock data
      const voxel = createTestVoxel();
      mockPrisma._mockVoxels.set(voxel.id, {
        id: voxel.id,
        urn: voxel.urn,
        project_id: voxel.projectId,
        voxel_id: voxel.voxelId,
        status: 'PLANNED',
        coord_x: voxel.center.x,
        coord_y: voxel.center.y,
        coord_z: voxel.center.z,
        resolution: voxel.resolution,
        min_x: voxel.bounds.min.x,
        max_x: voxel.bounds.max.x,
        min_y: voxel.bounds.min.y,
        max_y: voxel.bounds.max.y,
        min_z: voxel.bounds.min.z,
        max_z: voxel.bounds.max.z,
        level: voxel.level,
        zone: voxel.zone,
        system: voxel.system,
        ifc_elements: voxel.ifcElements,
        decision_count: 0,
        unacknowledged_count: 0,
        is_critical_path: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const voxels = await service.loadProjectVoxels('test-project-001');

      expect(Array.isArray(voxels)).toBe(true);
      expect(voxels.length).toBe(1);
      expect(voxels[0].projectId).toBe('test-project-001');
    });

    it('should return empty array for non-existent project', async () => {
      const voxels = await service.loadProjectVoxels('non-existent-project');

      expect(Array.isArray(voxels)).toBe(true);
      expect(voxels.length).toBe(0);
    });
  });

  // ===========================================================================
  // getVoxel Tests
  // ===========================================================================

  describe('getVoxel', () => {
    it('should get voxel by ID', async () => {
      const voxel = createTestVoxel({ id: 'specific-voxel-id' });
      mockPrisma._mockVoxels.set(voxel.id, {
        id: voxel.id,
        urn: voxel.urn,
        project_id: voxel.projectId,
        voxel_id: voxel.voxelId,
        status: 'PLANNED',
        coord_x: 150,
        coord_y: 150,
        coord_z: 150,
        resolution: 100,
        min_x: 100,
        max_x: 200,
        min_y: 100,
        max_y: 200,
        min_z: 100,
        max_z: 200,
        ifc_elements: ['elem-001'],
        decision_count: 0,
        unacknowledged_count: 0,
        is_critical_path: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.getVoxel('specific-voxel-id');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('specific-voxel-id');
    });

    it('should return null for non-existent voxel', async () => {
      const result = await service.getVoxel('non-existent-voxel');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // queryVoxels Tests
  // ===========================================================================

  describe('queryVoxels', () => {
    beforeEach(() => {
      // Populate mock data for queries
      for (let i = 0; i < 20; i++) {
        const id = `query-voxel-${i}`;
        mockPrisma._mockVoxels.set(id, {
          id,
          urn: `urn:luhtech:test:voxel:${id}`,
          project_id: 'test-project-001',
          voxel_id: `VOX-QUERY-${i}`,
          status: i < 10 ? 'PLANNED' : 'IN_PROGRESS',
          coord_x: i * 100,
          coord_y: i * 100,
          coord_z: i * 100,
          resolution: 100,
          min_x: i * 100 - 50,
          max_x: i * 100 + 50,
          min_y: i * 100 - 50,
          max_y: i * 100 + 50,
          min_z: i * 100 - 50,
          max_z: i * 100 + 50,
          level: i < 10 ? 'Level 1' : 'Level 2',
          system: i % 2 === 0 ? 'MECHANICAL' : 'ELECTRICAL',
          ifc_elements: [`elem-${i}`],
          decision_count: i % 3,
          unacknowledged_count: 0,
          is_critical_path: false,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    });

    it('should query voxels by project', async () => {
      const query: VoxelSpatialQuery = {
        projectId: 'test-project-001',
      };

      const result = await service.queryVoxels(query);

      expect(result.totalCount).toBe(20);
      expect(result.voxels.length).toBeLessThanOrEqual(100);
    });

    it('should filter by status', async () => {
      const query: VoxelSpatialQuery = {
        projectId: 'test-project-001',
        statuses: [VoxelStatus.PLANNED],
      };

      const result = await service.queryVoxels(query);

      expect(result.voxels.every((v) => v.status === VoxelStatus.PLANNED)).toBe(true);
    });

    it('should filter by bounding box', async () => {
      const query: VoxelSpatialQuery = {
        projectId: 'test-project-001',
        boundingBox: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 500, y: 500, z: 500 },
        },
      };

      const result = await service.queryVoxels(query);

      expect(result.voxels.every((v) =>
        v.center.x >= 0 && v.center.x <= 500 &&
        v.center.y >= 0 && v.center.y <= 500 &&
        v.center.z >= 0 && v.center.z <= 500
      )).toBe(true);
    });

    it('should filter by systems', async () => {
      const query: VoxelSpatialQuery = {
        projectId: 'test-project-001',
        systems: [VoxelSystem.MECHANICAL],
      };

      const result = await service.queryVoxels(query);

      expect(result.voxels.every((v) => v.system === VoxelSystem.MECHANICAL)).toBe(true);
    });

    it('should filter by levels', async () => {
      const query: VoxelSpatialQuery = {
        projectId: 'test-project-001',
        levels: ['Level 1'],
      };

      const result = await service.queryVoxels(query);

      expect(result.voxels.every((v) => v.level === 'Level 1')).toBe(true);
    });

    it('should filter by hasDecisions', async () => {
      const query: VoxelSpatialQuery = {
        projectId: 'test-project-001',
        hasDecisions: true,
      };

      const result = await service.queryVoxels(query);

      expect(result.voxels.every((v) => v.decisionCount > 0)).toBe(true);
    });

    it('should respect limit', async () => {
      const query: VoxelSpatialQuery = {
        projectId: 'test-project-001',
        limit: 5,
      };

      const result = await service.queryVoxels(query);

      expect(result.voxels.length).toBeLessThanOrEqual(5);
    });

    it('should respect offset', async () => {
      const query: VoxelSpatialQuery = {
        projectId: 'test-project-001',
        offset: 5,
        limit: 5,
      };

      const result = await service.queryVoxels(query);

      expect(result.voxels.length).toBeLessThanOrEqual(5);
    });
  });

  // ===========================================================================
  // updateVoxelStatus Tests
  // ===========================================================================

  describe('updateVoxelStatus', () => {
    it('should update voxel status', async () => {
      const id = 'status-update-voxel';
      mockPrisma._mockVoxels.set(id, {
        id,
        urn: `urn:luhtech:test:voxel:${id}`,
        project_id: 'test-project-001',
        voxel_id: 'VOX-STATUS-001',
        status: 'PLANNED',
        coord_x: 150,
        coord_y: 150,
        coord_z: 150,
        resolution: 100,
        min_x: 100,
        max_x: 200,
        min_y: 100,
        max_y: 200,
        min_z: 100,
        max_z: 200,
        ifc_elements: ['elem-001'],
        decision_count: 0,
        unacknowledged_count: 0,
        is_critical_path: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.updateVoxelStatus(id, VoxelStatus.IN_PROGRESS);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(VoxelStatus.IN_PROGRESS);
    });

    it('should update percent complete', async () => {
      const id = 'percent-update-voxel';
      mockPrisma._mockVoxels.set(id, {
        id,
        urn: `urn:luhtech:test:voxel:${id}`,
        project_id: 'test-project-001',
        voxel_id: 'VOX-PERCENT-001',
        status: 'IN_PROGRESS',
        coord_x: 150,
        coord_y: 150,
        coord_z: 150,
        resolution: 100,
        min_x: 100,
        max_x: 200,
        min_y: 100,
        max_y: 200,
        min_z: 100,
        max_z: 200,
        percent_complete: 25,
        ifc_elements: ['elem-001'],
        decision_count: 0,
        unacknowledged_count: 0,
        is_critical_path: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.updateVoxelStatus(id, VoxelStatus.IN_PROGRESS, 75);

      expect(result).not.toBeNull();
      expect(result?.percentComplete).toBe(75);
    });

    it('should return null for non-existent voxel', async () => {
      const result = await service.updateVoxelStatus('non-existent', VoxelStatus.COMPLETE);

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // attachDecision Tests
  // ===========================================================================

  describe('attachDecision', () => {
    it('should attach decision to voxel', async () => {
      const id = 'decision-voxel';
      mockPrisma._mockVoxels.set(id, {
        id,
        urn: `urn:luhtech:test:voxel:${id}`,
        project_id: 'test-project-001',
        voxel_id: 'VOX-DEC-001',
        status: 'PLANNED',
        coord_x: 150,
        coord_y: 150,
        coord_z: 150,
        resolution: 100,
        min_x: 100,
        max_x: 200,
        min_y: 100,
        max_y: 200,
        min_z: 100,
        max_z: 200,
        ifc_elements: ['elem-001'],
        decision_count: 0,
        unacknowledged_count: 0,
        is_critical_path: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const input: DecisionAttachmentInput = {
        voxelId: id,
        decisionId: 'decision-001',
        attachmentType: 'LOCATION',
        label: 'Test Attachment',
        summary: 'Test decision attachment',
      };

      const result = await service.attachDecision(input);

      expect(result).toBe(true);
    });

    it('should handle attachment with acknowledgment', async () => {
      const id = 'ack-voxel';
      mockPrisma._mockVoxels.set(id, {
        id,
        decision_count: 0,
        unacknowledged_count: 0,
      });

      const input: DecisionAttachmentInput = {
        voxelId: id,
        decisionId: 'decision-002',
        attachmentType: 'IMPACT',
        requiresAcknowledgment: true,
      };

      const result = await service.attachDecision(input);

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // getAggregation Tests
  // ===========================================================================

  describe('getAggregation', () => {
    it('should aggregate by level', async () => {
      const result = await service.getAggregation('test-project-001', AggregationLevel.LEVEL);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].level).toBe(AggregationLevel.LEVEL);
      expect(result[0].voxelCount).toBe(100);
    });

    it('should aggregate by system', async () => {
      const result = await service.getAggregation('test-project-001', AggregationLevel.SYSTEM);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should aggregate by zone', async () => {
      const result = await service.getAggregation('test-project-001', AggregationLevel.ZONE);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should aggregate by project', async () => {
      const result = await service.getAggregation('test-project-001', AggregationLevel.PROJECT);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should include cost metrics', async () => {
      const result = await service.getAggregation('test-project-001', AggregationLevel.LEVEL);

      expect(result[0].totalEstimatedCost).toBeDefined();
      expect(result[0].totalActualCost).toBeDefined();
      expect(result[0].costVariance).toBeDefined();
    });

    it('should include progress metrics', async () => {
      const result = await service.getAggregation('test-project-001', AggregationLevel.LEVEL);

      expect(result[0].plannedCount).toBeDefined();
      expect(result[0].inProgressCount).toBeDefined();
      expect(result[0].completeCount).toBeDefined();
      expect(result[0].overallProgress).toBeDefined();
    });

    it('should calculate health score', async () => {
      const result = await service.getAggregation('test-project-001', AggregationLevel.LEVEL);

      expect(result[0].healthScore).toBeDefined();
      expect(result[0].healthScore).toBeGreaterThanOrEqual(0);
      expect(result[0].healthScore).toBeLessThanOrEqual(100);
    });
  });

  // ===========================================================================
  // getVoxelActivity Tests
  // ===========================================================================

  describe('getVoxelActivity', () => {
    it('should return activity feed', async () => {
      const result = await service.getVoxelActivity('test-project-001');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should respect limit', async () => {
      const result = await service.getVoxelActivity('test-project-001', 10);

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should include voxel information', async () => {
      // Add mock attachment
      mockPrisma._mockAttachments.push({
        id: 'test-att',
        voxel_id: 'voxel-001',
        decision_id: 'dec-001',
        summary: 'Test',
        requires_acknowledgment: false,
        attached_at: new Date(),
      });

      const result = await service.getVoxelActivity('test-project-001');

      if (result.length > 0) {
        expect(result[0].voxelId).toBeDefined();
        expect(result[0].timestamp).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // deleteProjectVoxels Tests
  // ===========================================================================

  describe('deleteProjectVoxels', () => {
    it('should delete all voxels for project', async () => {
      // Add voxels to mock
      for (let i = 0; i < 5; i++) {
        mockPrisma._mockVoxels.set(`delete-vox-${i}`, {
          id: `delete-vox-${i}`,
          project_id: 'delete-project',
        });
      }

      const count = await service.deleteProjectVoxels('delete-project');

      expect(count).toBe(5);
    });

    it('should return 0 for non-existent project', async () => {
      const count = await service.deleteProjectVoxels('non-existent');

      expect(count).toBe(0);
    });
  });

  // ===========================================================================
  // getVoxelCount Tests
  // ===========================================================================

  describe('getVoxelCount', () => {
    it('should return voxel count for project', async () => {
      // Add voxels
      for (let i = 0; i < 10; i++) {
        mockPrisma._mockVoxels.set(`count-vox-${i}`, {
          id: `count-vox-${i}`,
          project_id: 'count-project',
        });
      }

      const count = await service.getVoxelCount('count-project');

      expect(count).toBe(10);
    });

    it('should return 0 for empty project', async () => {
      const count = await service.getVoxelCount('empty-project');

      expect(count).toBe(0);
    });
  });
});
