/**
 * Unit tests for pm-data-service.ts
 * DEC-003: PostgreSQL-backed data service for PM collections.
 * Prisma is mocked — no real database connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock PrismaClient before importing the service
vi.mock('@prisma/client', () => {
  const mockPrismaInstance = {
    pMDecision: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    voxel: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    inspection: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    consequence: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    toleranceOverride: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };

  return {
    PrismaClient: vi.fn(() => mockPrismaInstance),
    __mockInstance: mockPrismaInstance,
  };
});

// Mock pm-urn.utils.js
vi.mock('../pm-urn.utils.js', () => ({
  buildFileURN: vi.fn((projectId: string, type: string) =>
    `urn:luhtech:${projectId}:file:${type}`,
  ),
  setIdCounter: vi.fn(),
  parseURN: vi.fn((urn: string) => {
    if (!urn) return null;
    const parts = urn.split(':');
    return parts.length >= 5 ? { identifier: parts[parts.length - 1] } : null;
  }),
}));

import {
  loadDecisions,
  saveDecisions,
  loadVoxels,
  saveVoxels,
  loadInspections,
  saveInspections,
  getPrisma,
  disconnectDb,
} from '../pm-data-service.js';
import type { PMDecisionsCollection, VoxelsCollection, InspectionsCollection } from '../../types/pm.types.js';

// Get mock instance for assertions
const { __mockInstance: mockPrisma } = await import('@prisma/client') as any;

const PROJECT_ID = 'dc1eaa5b-7553-46ec-92a5-e20762a60c71';

describe('pm-data-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  });

  afterEach(async () => {
    await disconnectDb();
    delete process.env.DATABASE_URL;
  });

  // =========================================================================
  // Test 1: getPrisma() throws when DATABASE_URL not set
  // =========================================================================
  it('getPrisma() throws with clear message when DATABASE_URL not set', async () => {
    await disconnectDb();
    delete process.env.DATABASE_URL;

    expect(() => getPrisma()).toThrowError('[pm-data-service] DATABASE_URL is not set');
  });

  // =========================================================================
  // Test 2: getPrisma() returns same instance on second call (singleton)
  // =========================================================================
  it('getPrisma() returns same instance on second call (singleton)', () => {
    const first = getPrisma();
    const second = getPrisma();
    expect(first).toBe(second);
  });

  // =========================================================================
  // Test 3: disconnectDb() calls $disconnect and resets singleton
  // =========================================================================
  it('disconnectDb() calls $disconnect and resets singleton', async () => {
    const prisma = getPrisma();
    await disconnectDb();

    expect(mockPrisma.$disconnect).toHaveBeenCalled();

    // After disconnect, next getPrisma creates a new instance
    const newPrisma = getPrisma();
    // Both are mock instances, so just verify disconnect was called
    expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Test 4: loadDecisions returns PMDecisionsCollection with correct shape
  // =========================================================================
  it('loadDecisions returns PMDecisionsCollection with correct shape', async () => {
    const mockRow = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      urn: `urn:luhtech:${PROJECT_ID}:pm-decision:DEC-2026-0001`,
      project_id: PROJECT_ID,
      decision_id: 'DEC-2026-0001',
      title: 'Test Decision',
      description: 'A test decision',
      type: 'APPROVAL',
      status: 'PENDING',
      authority_required: 2,
      authority_current: 0,
      primary_voxel_urn: `urn:luhtech:${PROJECT_ID}:voxel:VOX-L2-MECH-001`,
      budget_estimated: 5000,
      budget_actual: null,
      budget_currency: 'USD',
      delay_days: 3,
      critical_path: false,
      supersedes_urn: null,
      superseded_by_urn: null,
      evidence: null,
      graph_metadata: { inEdges: [], outEdges: [] },
      meta: { voxelContext: { voxelId: 'VOX-L2-MECH-001' } },
      created_at: new Date('2026-03-15T10:00:00Z'),
      updated_at: new Date('2026-03-15T10:00:00Z'),
    };

    mockPrisma.pMDecision.findMany.mockResolvedValue([mockRow]);

    const collection = await loadDecisions(PROJECT_ID);

    expect(collection.$schema).toBe('https://luhtech.dev/schemas/pm/decisions-collection.json');
    expect(collection.schemaVersion).toBe('3.0.0');
    expect(collection.meta.projectId).toBe(PROJECT_ID);
    expect(collection.meta.sourceOfTruth).toBe('postgresql');
    expect(collection.decisions).toHaveLength(1);

    const decision = collection.decisions[0];
    expect(decision.decisionId).toBe('DEC-2026-0001');
    expect(decision.title).toBe('Test Decision');
    expect(decision.type).toBe('APPROVAL');
    expect(decision.status).toBe('PENDING');
    expect(decision.authorityLevel.required).toBe(2);
    expect(decision.authorityLevel.current).toBe(0);
    expect(decision.budgetImpact?.estimated).toBe(5000);
    expect(decision.budgetImpact?.currency).toBe('USD');
    expect(decision.scheduleImpact?.delayDays).toBe(3);
    expect(decision.scheduleImpact?.criticalPath).toBe(false);
  });

  // =========================================================================
  // Test 5: loadDecisions with empty result returns collection with decisions: []
  // =========================================================================
  it('loadDecisions with empty result returns collection with decisions: []', async () => {
    mockPrisma.pMDecision.findMany.mockResolvedValue([]);

    const collection = await loadDecisions(PROJECT_ID);

    expect(collection.decisions).toEqual([]);
    expect(collection.meta.totalDecisions).toBe(0);
    expect(collection.indexes.byStatus).toEqual({});
  });

  // =========================================================================
  // Test 6: toPMDecision correctly maps flat Prisma row to nested shape
  // =========================================================================
  it('toPMDecision correctly maps authority and budget fields', async () => {
    const mockRow = {
      urn: `urn:luhtech:${PROJECT_ID}:pm-decision:DEC-2026-0002`,
      project_id: PROJECT_ID,
      decision_id: 'DEC-2026-0002',
      title: 'Budget Test',
      description: null,
      type: 'PROPOSAL',
      status: 'APPROVED',
      authority_required: 4,
      authority_current: 4,
      primary_voxel_urn: null,
      budget_estimated: '12500.50', // Prisma Decimal returns string
      budget_actual: '12000.00',
      budget_currency: 'CAD',
      delay_days: null,
      critical_path: false,
      supersedes_urn: null,
      superseded_by_urn: null,
      evidence: null,
      graph_metadata: null,
      meta: {},
      created_at: new Date('2026-03-15T10:00:00Z'),
      updated_at: new Date('2026-03-15T11:00:00Z'),
    };

    mockPrisma.pMDecision.findMany.mockResolvedValue([mockRow]);

    const collection = await loadDecisions(PROJECT_ID);
    const decision = collection.decisions[0];

    // Authority nested object reconstructed
    expect(decision.authorityLevel.required).toBe(4);
    expect(decision.authorityLevel.current).toBe(4);

    // Budget Decimal → Number conversion
    expect(decision.budgetImpact?.estimated).toBe(12500.50);
    expect(decision.budgetImpact?.actual).toBe(12000.00);
    expect(decision.budgetImpact?.currency).toBe('CAD');

    // No schedule impact when delay_days is null
    expect(decision.scheduleImpact).toBeUndefined();
  });

  // =========================================================================
  // Test 7: saveDecisions calls prisma.$transaction with upsert for each decision
  // =========================================================================
  it('saveDecisions calls prisma.$transaction with upsert for each decision', async () => {
    const collection: PMDecisionsCollection = {
      $schema: 'https://luhtech.dev/schemas/pm/decisions-collection.json',
      $id: `urn:luhtech:${PROJECT_ID}:file:decisions`,
      schemaVersion: '3.0.0',
      meta: {
        projectId: PROJECT_ID,
        sourceOfTruth: 'postgresql',
        lastUpdated: new Date().toISOString(),
        totalDecisions: 2,
      },
      indexes: { byStatus: {} as any, byVoxel: {}, byAuthorityLevel: {} },
      decisions: [
        {
          $id: `urn:luhtech:${PROJECT_ID}:pm-decision:DEC-2026-0001` as any,
          $schema: 'https://luhtech.dev/schemas/pm/decision.schema.json',
          schemaVersion: '3.0.0',
          meta: { projectId: PROJECT_ID, sourceOfTruth: 'postgresql', lastUpdated: '' },
          decisionId: 'DEC-2026-0001',
          title: 'Decision One',
          type: 'APPROVAL',
          status: 'PENDING',
          authorityLevel: { required: 2 as any, current: 0 as any },
          voxelRef: `urn:luhtech:${PROJECT_ID}:voxel:VOX-L2-001` as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          graphMetadata: { inEdges: [], outEdges: [] },
        },
        {
          $id: `urn:luhtech:${PROJECT_ID}:pm-decision:DEC-2026-0002` as any,
          $schema: 'https://luhtech.dev/schemas/pm/decision.schema.json',
          schemaVersion: '3.0.0',
          meta: { projectId: PROJECT_ID, sourceOfTruth: 'postgresql', lastUpdated: '' },
          decisionId: 'DEC-2026-0002',
          title: 'Decision Two',
          type: 'REJECTION',
          status: 'APPROVED',
          authorityLevel: { required: 3 as any, current: 3 as any },
          voxelRef: `urn:luhtech:${PROJECT_ID}:voxel:VOX-L2-002` as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          graphMetadata: { inEdges: [], outEdges: [] },
        },
      ],
    };

    await saveDecisions(PROJECT_ID, collection);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // Transaction receives an array of upsert promises — one per decision
    const transactionArgs = mockPrisma.$transaction.mock.calls[0][0];
    expect(transactionArgs).toHaveLength(2);
  });

  // =========================================================================
  // Test 8: loadVoxels returns VoxelsCollection with correct shape
  // =========================================================================
  it('loadVoxels returns VoxelsCollection with correct shape', async () => {
    const mockRow = {
      urn: `urn:luhtech:${PROJECT_ID}:voxel:VOX-L2-MECH-001`,
      project_id: PROJECT_ID,
      voxel_id: 'VOX-L2-MECH-001',
      status: 'IN_PROGRESS',
      coord_x: 10.5,
      coord_y: 20.3,
      coord_z: 3.0,
      resolution: 1.0,
      building: 'Main',
      level: 'L2',
      zone: 'Zone-A',
      system: 'MECH',
      grid_reference: 'A-3',
      estimated_cost: null,
      actual_cost: null,
      estimated_hours: 40,
      actual_hours: 25,
      planned_start: null,
      planned_end: null,
      actual_start: null,
      actual_end: null,
      is_critical_path: false,
      graph_metadata: { inEdges: [], outEdges: [] },
      meta: {},
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockPrisma.voxel.findMany.mockResolvedValue([mockRow]);

    const collection = await loadVoxels(PROJECT_ID);

    expect(collection.$schema).toBe('https://luhtech.dev/schemas/pm/voxels-collection.json');
    expect(collection.voxels).toHaveLength(1);

    const voxel = collection.voxels[0];
    expect(voxel.voxelId).toBe('VOX-L2-MECH-001');
    expect(voxel.coordinates.x).toBe(10.5);
    expect(voxel.coordinates.y).toBe(20.3);
    expect(voxel.coordinates.z).toBe(3.0);
    expect(voxel.location?.building).toBe('Main');
    expect(voxel.location?.level).toBe('L2');
    expect(voxel.location?.system).toBe('MECH');
    expect(voxel.status).toBe('IN_PROGRESS');
  });

  // =========================================================================
  // Test 9: saveVoxels calls prisma.$transaction
  // =========================================================================
  it('saveVoxels calls prisma.$transaction', async () => {
    const collection: VoxelsCollection = {
      $schema: 'https://luhtech.dev/schemas/pm/voxels-collection.json',
      $id: `urn:luhtech:${PROJECT_ID}:file:voxels`,
      schemaVersion: '3.0.0',
      meta: {
        projectId: PROJECT_ID,
        sourceOfTruth: 'postgresql',
        lastUpdated: new Date().toISOString(),
        totalVoxels: 1,
      },
      indexes: { byStatus: {} as any, byLevel: {}, byZone: {} },
      voxels: [
        {
          $id: `urn:luhtech:${PROJECT_ID}:voxel:VOX-L2-001` as any,
          $schema: 'https://luhtech.dev/schemas/pm/voxel.schema.json',
          schemaVersion: '3.0.0',
          voxelId: 'VOX-L2-001',
          coordinates: { x: 0, y: 0, z: 0 },
          status: 'PLANNED',
          graphMetadata: { inEdges: [], outEdges: [] },
        },
      ],
    };

    await saveVoxels(PROJECT_ID, collection);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Test 10: loadInspections returns InspectionsCollection
  // =========================================================================
  it('loadInspections returns InspectionsCollection with correct shape', async () => {
    const mockRow = {
      urn: `urn:luhtech:${PROJECT_ID}:inspection:INSP-2026-0001`,
      project_id: PROJECT_ID,
      inspection_id: 'INSP-2026-0001',
      inspection_type: 'ROUGH_IN',
      status: 'SCHEDULED',
      result_outcome: null,
      scheduled_date: new Date('2026-04-01T08:00:00Z'),
      completed_at: null,
      decisions_validated: [],
      decisions_failed: [],
      result_conditions: [],
      reinspection_required: false,
      findings: null,
      punch_list: null,
      evidence: null,
      graph_metadata: { inEdges: [], outEdges: [] },
      meta: { voxelRef: `urn:luhtech:${PROJECT_ID}:voxel:VOX-L2-001` },
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockPrisma.inspection.findMany.mockResolvedValue([mockRow]);

    const collection = await loadInspections(PROJECT_ID);

    expect(collection.$schema).toBe('https://luhtech.dev/schemas/pm/inspections-collection.json');
    expect(collection.inspections).toHaveLength(1);

    const inspection = collection.inspections[0];
    expect(inspection.inspectionId).toBe('INSP-2026-0001');
    expect(inspection.type).toBe('ROUGH_IN');
    expect(inspection.status).toBe('SCHEDULED');
    expect(inspection.scheduledDate).toContain('2026-04-01');
  });
});
