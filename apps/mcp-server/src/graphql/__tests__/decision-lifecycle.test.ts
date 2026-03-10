/**
 * Decision Lifecycle GraphQL Tests
 *
 * Comprehensive test suite for Decision Lifecycle resolvers.
 * Tests queries, mutations, and subscriptions for all entities.
 *
 * @module tests/graphql/decision-lifecycle
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decisionResolvers } from '../decision/decision.resolvers.js';
import { voxelResolvers } from '../voxel/voxel.resolvers.js';
import { decisionLifecycleResolvers } from '../decision-lifecycle.resolvers.js';

// ==============================================================================
// Mock Prisma Client
// ==============================================================================

const createMockPrisma = () => ({
  pMDecision: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  voxel: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  voxelDecisionAttachment: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  voxelAlert: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  preApproval: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  inspection: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  consequence: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  scheduleProposal: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  participant: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  decisionEvent: {
    findMany: vi.fn(),
  },
  acknowledgment: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
});

// ==============================================================================
// Decision Resolver Tests
// ==============================================================================

describe('Decision Resolvers', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let context: { prisma: any; user?: { id: string; tenantId?: string } };

  beforeEach(() => {
    prisma = createMockPrisma();
    context = { prisma, user: { id: 'user-123', tenantId: 'tenant-123' } };
    vi.clearAllMocks();
  });

  describe('Query.pmDecision', () => {
    it('should fetch decision by id', async () => {
      const mockDecision = {
        id: 'dec-123',
        urn: 'urn:ectropy:decision:DEC-000001',
        title: 'Test Decision',
        status: 'PENDING',
      };
      prisma.pMDecision.findUnique.mockResolvedValue(mockDecision);

      const result = await decisionResolvers.Query.pmDecision(
        {},
        { id: 'dec-123' },
        context
      );

      expect(prisma.pMDecision.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dec-123' },
        })
      );
      expect(result).toEqual(mockDecision);
    });

    it('should fetch decision by urn', async () => {
      const mockDecision = {
        id: 'dec-456',
        urn: 'urn:ectropy:decision:DEC-000002',
        title: 'Another Decision',
        status: 'APPROVED',
      };
      prisma.pMDecision.findUnique.mockResolvedValue(mockDecision);

      const result = await decisionResolvers.Query.pmDecision(
        {},
        { urn: 'urn:ectropy:decision:DEC-000002' },
        context
      );

      expect(prisma.pMDecision.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { urn: 'urn:ectropy:decision:DEC-000002' },
        })
      );
      expect(result).toEqual(mockDecision);
    });

    it('should throw error when neither id nor urn provided', async () => {
      await expect(
        decisionResolvers.Query.pmDecision({}, {}, context)
      ).rejects.toThrow('Either id or urn must be provided');
    });
  });

  describe('Query.pmDecisions', () => {
    it('should fetch paginated decisions', async () => {
      const mockDecisions = [
        { id: 'dec-1', title: 'Decision 1' },
        { id: 'dec-2', title: 'Decision 2' },
      ];
      prisma.pMDecision.findMany.mockResolvedValue(mockDecisions);
      prisma.pMDecision.count.mockResolvedValue(10);

      const result = await decisionResolvers.Query.pmDecisions(
        {},
        { pagination: { page: 1, limit: 2 } },
        context
      );

      expect(result.nodes).toEqual(mockDecisions);
      expect(result.totalCount).toBe(10);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.currentPage).toBe(1);
    });

    it('should filter by projectId', async () => {
      prisma.pMDecision.findMany.mockResolvedValue([]);
      prisma.pMDecision.count.mockResolvedValue(0);

      await decisionResolvers.Query.pmDecisions(
        {},
        { filter: { projectId: 'proj-123' } },
        context
      );

      expect(prisma.pMDecision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            project_id: 'proj-123',
          }),
        })
      );
    });

    it('should filter by status', async () => {
      prisma.pMDecision.findMany.mockResolvedValue([]);
      prisma.pMDecision.count.mockResolvedValue(0);

      await decisionResolvers.Query.pmDecisions(
        {},
        { filter: { status: 'PENDING' } },
        context
      );

      expect(prisma.pMDecision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      );
    });
  });

  describe('Query.pendingDecisions', () => {
    it('should fetch only pending decisions', async () => {
      prisma.pMDecision.findMany.mockResolvedValue([]);
      prisma.pMDecision.count.mockResolvedValue(0);

      await decisionResolvers.Query.pendingDecisions(
        {},
        { pagination: { page: 1, limit: 20 } },
        context
      );

      expect(prisma.pMDecision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      );
    });
  });

  describe('Mutation.captureDecision', () => {
    it('should create a new decision', async () => {
      const mockDecision = {
        id: 'new-dec',
        title: 'New Decision',
        status: 'PENDING',
      };
      prisma.pMDecision.create.mockResolvedValue(mockDecision);

      const result = await decisionResolvers.Mutation.captureDecision(
        {},
        {
          input: {
            projectId: 'proj-123',
            type: 'TECHNICAL',
            title: 'New Decision',
            description: 'Test description',
            authorityLevel: 'FOREMAN',
          },
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.decision).toEqual(mockDecision);
    });

    it('should return error on failure', async () => {
      prisma.pMDecision.create.mockRejectedValue(new Error('Database error'));

      const result = await decisionResolvers.Mutation.captureDecision(
        {},
        {
          input: {
            projectId: 'proj-123',
            type: 'TECHNICAL',
            title: 'Failing Decision',
            description: 'Test',
            authorityLevel: 'FOREMAN',
          },
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('Mutation.approveDecision', () => {
    it('should approve a decision', async () => {
      const mockDecision = {
        id: 'dec-123',
        status: 'APPROVED',
        project_id: 'proj-123',
        approved_by_id: 'user-123',
      };
      prisma.pMDecision.update.mockResolvedValue(mockDecision);

      const result = await decisionResolvers.Mutation.approveDecision(
        {},
        {
          input: {
            decisionId: 'dec-123',
            comment: 'Looks good',
          },
        },
        context
      );

      expect(result.success).toBe(true);
      expect(prisma.pMDecision.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dec-123' },
          data: expect.objectContaining({
            status: 'APPROVED',
          }),
        })
      );
    });
  });

  describe('Mutation.rejectDecision', () => {
    it('should reject a decision with reason', async () => {
      const mockDecision = {
        id: 'dec-123',
        status: 'REJECTED',
        project_id: 'proj-123',
        rejection_reason: 'Not compliant',
      };
      prisma.pMDecision.update.mockResolvedValue(mockDecision);

      const result = await decisionResolvers.Mutation.rejectDecision(
        {},
        {
          input: {
            decisionId: 'dec-123',
            reason: 'Not compliant',
          },
        },
        context
      );

      expect(result.success).toBe(true);
      expect(prisma.pMDecision.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dec-123' },
          data: expect.objectContaining({
            status: 'REJECTED',
            rejection_reason: 'Not compliant',
          }),
        })
      );
    });
  });

  describe('Mutation.escalateDecision', () => {
    it('should escalate a decision', async () => {
      const mockOriginal = {
        id: 'dec-123',
        project_id: 'proj-123',
        type: 'TECHNICAL',
        title: 'Original Decision',
        description: 'Description',
        justification: 'Justification',
        urgency: 'STANDARD',
        impact_categories: [],
        cost_impact: 1000,
        schedule_impact: 2,
      };
      const mockEscalated = {
        id: 'dec-new',
        status: 'PENDING',
        project_id: 'proj-123',
      };
      prisma.pMDecision.findUnique.mockResolvedValue(mockOriginal);
      prisma.pMDecision.create.mockResolvedValue(mockEscalated);
      prisma.pMDecision.update.mockResolvedValue({ ...mockOriginal, status: 'ESCALATED' });

      const result = await decisionResolvers.Mutation.escalateDecision(
        {},
        {
          input: {
            decisionId: 'dec-123',
            targetAuthorityLevel: 'PM',
            reason: 'Exceeds authority',
          },
        },
        context
      );

      expect(result.success).toBe(true);
      expect(prisma.pMDecision.create).toHaveBeenCalled();
    });
  });
});

// ==============================================================================
// Voxel Resolver Tests
// ==============================================================================

describe('Voxel Resolvers', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let context: { prisma: any; user?: { id: string; tenantId?: string } };

  beforeEach(() => {
    prisma = createMockPrisma();
    context = { prisma, user: { id: 'user-123', tenantId: 'tenant-123' } };
    vi.clearAllMocks();
  });

  describe('Query.voxel', () => {
    it('should fetch voxel by id', async () => {
      const mockVoxel = {
        id: 'vox-123',
        urn: 'urn:ectropy:voxel:proj-123:VOX-000001',
        name: 'Zone A',
        type: 'ZONE',
        status: 'PLANNED',
      };
      prisma.voxel.findUnique.mockResolvedValue(mockVoxel);

      const result = await voxelResolvers.Query.voxel(
        {},
        { id: 'vox-123' },
        context
      );

      expect(prisma.voxel.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vox-123' },
        })
      );
      expect(result).toEqual(mockVoxel);
    });

    it('should throw error when neither id nor urn provided', async () => {
      await expect(
        voxelResolvers.Query.voxel({}, {}, context)
      ).rejects.toThrow('Either id or urn must be provided');
    });
  });

  describe('Query.voxels', () => {
    it('should fetch paginated voxels', async () => {
      const mockVoxels = [
        { id: 'vox-1', name: 'Zone A' },
        { id: 'vox-2', name: 'Zone B' },
      ];
      prisma.voxel.findMany.mockResolvedValue(mockVoxels);
      prisma.voxel.count.mockResolvedValue(15);

      const result = await voxelResolvers.Query.voxels(
        {},
        { pagination: { page: 1, limit: 10 } },
        context
      );

      expect(result.nodes).toEqual(mockVoxels);
      expect(result.totalCount).toBe(15);
      expect(result.pageInfo.hasNextPage).toBe(true);
    });

    it('should filter by type', async () => {
      prisma.voxel.findMany.mockResolvedValue([]);
      prisma.voxel.count.mockResolvedValue(0);

      await voxelResolvers.Query.voxels(
        {},
        { filter: { type: 'ZONE' } },
        context
      );

      expect(prisma.voxel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'ZONE',
          }),
        })
      );
    });

    it('should filter by parent', async () => {
      prisma.voxel.findMany.mockResolvedValue([]);
      prisma.voxel.count.mockResolvedValue(0);

      await voxelResolvers.Query.voxels(
        {},
        { filter: { parentId: 'parent-123' } },
        context
      );

      expect(prisma.voxel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parent_id: 'parent-123',
          }),
        })
      );
    });
  });

  describe('Query.voxelTree', () => {
    it('should fetch voxel tree for project', async () => {
      const mockTree = [
        { id: 'vox-1', name: 'Root Zone', children: [] },
      ];
      prisma.voxel.findMany.mockResolvedValue(mockTree);

      const result = await voxelResolvers.Query.voxelTree(
        {},
        { projectId: 'proj-123' },
        context
      );

      expect(prisma.voxel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            project_id: 'proj-123',
            parent_id: null,
          }),
        })
      );
      expect(result).toEqual(mockTree);
    });
  });

  describe('Query.voxelDecisionSurface', () => {
    it('should fetch decision surface for voxel', async () => {
      const mockVoxel = {
        id: 'vox-123',
        decision_attachments: [
          {
            decision: { id: 'dec-1', status: 'PENDING' },
          },
          {
            decision: { id: 'dec-2', status: 'APPROVED' },
          },
        ],
        alerts: [{ id: 'alert-1', status: 'ACTIVE' }],
        tolerance_overrides: [],
        pre_approvals: [],
      };
      prisma.voxel.findUnique.mockResolvedValue(mockVoxel);

      const result = await voxelResolvers.Query.voxelDecisionSurface(
        {},
        { voxelId: 'vox-123' },
        context
      );

      expect(result.voxel).toEqual(mockVoxel);
      expect(result.totalDecisionCount).toBe(2);
      expect(result.pendingCount).toBe(1);
      expect(result.alertCount).toBe(1);
    });

    it('should throw error for non-existent voxel', async () => {
      prisma.voxel.findUnique.mockResolvedValue(null);

      await expect(
        voxelResolvers.Query.voxelDecisionSurface(
          {},
          { voxelId: 'non-existent' },
          context
        )
      ).rejects.toThrow('Voxel not found');
    });
  });

  describe('Mutation.createVoxel', () => {
    it('should create a new voxel', async () => {
      const mockVoxel = {
        id: 'new-vox',
        name: 'New Zone',
        type: 'ZONE',
        status: 'PLANNED',
      };
      prisma.voxel.create.mockResolvedValue(mockVoxel);

      const result = await voxelResolvers.Mutation.createVoxel(
        {},
        {
          input: {
            projectId: 'proj-123',
            type: 'ZONE',
            name: 'New Zone',
          },
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.voxel).toEqual(mockVoxel);
    });
  });

  describe('Mutation.updateVoxel', () => {
    it('should update a voxel', async () => {
      const mockVoxel = {
        id: 'vox-123',
        name: 'Updated Zone',
        project_id: 'proj-123',
      };
      prisma.voxel.update.mockResolvedValue(mockVoxel);

      const result = await voxelResolvers.Mutation.updateVoxel(
        {},
        {
          input: {
            id: 'vox-123',
            name: 'Updated Zone',
          },
        },
        context
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Mutation.createVoxelAlert', () => {
    it('should create a voxel alert', async () => {
      const mockAlert = {
        id: 'alert-123',
        voxel: { project_id: 'proj-123' },
        severity: 'HIGH',
        status: 'ACTIVE',
      };
      prisma.voxelAlert.create.mockResolvedValue(mockAlert);

      const result = await voxelResolvers.Mutation.createVoxelAlert(
        {},
        {
          input: {
            voxelId: 'vox-123',
            severity: 'HIGH',
            title: 'Alert Title',
            message: 'Alert message',
          },
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.alert).toEqual(mockAlert);
    });
  });

  describe('Mutation.resolveVoxelAlert', () => {
    it('should resolve a voxel alert', async () => {
      const mockAlert = {
        id: 'alert-123',
        status: 'RESOLVED',
        voxel: { project_id: 'proj-123' },
      };
      prisma.voxelAlert.update.mockResolvedValue(mockAlert);

      const result = await voxelResolvers.Mutation.resolveVoxelAlert(
        {},
        { alertId: 'alert-123', resolution: 'Fixed the issue' },
        context
      );

      expect(result.success).toBe(true);
      expect(prisma.voxelAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'alert-123' },
          data: expect.objectContaining({
            status: 'RESOLVED',
          }),
        })
      );
    });
  });

  describe('Mutation.createPreApproval', () => {
    it('should create a pre-approval', async () => {
      const mockPreApproval = {
        id: 'preapp-123',
        scope: 'Material substitution',
        usage_count: 0,
      };
      prisma.preApproval.create.mockResolvedValue(mockPreApproval);

      const result = await voxelResolvers.Mutation.createPreApproval(
        {},
        {
          input: {
            voxelId: 'vox-123',
            approvedById: 'user-123',
            scope: 'Material substitution',
            validFrom: new Date(),
            validUntil: new Date(Date.now() + 86400000),
          },
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.preApproval).toEqual(mockPreApproval);
    });
  });
});

// ==============================================================================
// Combined Resolver Tests
// ==============================================================================

describe('Decision Lifecycle Combined Resolvers', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let context: { prisma: any; user?: { id: string; tenantId?: string } };

  beforeEach(() => {
    prisma = createMockPrisma();
    context = { prisma, user: { id: 'user-123', tenantId: 'tenant-123' } };
    vi.clearAllMocks();
  });

  describe('Resolver structure', () => {
    it('should have custom scalars', () => {
      expect(decisionLifecycleResolvers.DateTime).toBeDefined();
      expect(decisionLifecycleResolvers.JSON).toBeDefined();
    });

    it('should have Query resolvers', () => {
      expect(decisionLifecycleResolvers.Query).toBeDefined();
      expect(decisionLifecycleResolvers.Query.pmDecision).toBeDefined();
      expect(decisionLifecycleResolvers.Query.voxel).toBeDefined();
      expect(decisionLifecycleResolvers.Query.inspection).toBeDefined();
      expect(decisionLifecycleResolvers.Query.consequence).toBeDefined();
      expect(decisionLifecycleResolvers.Query.scheduleProposal).toBeDefined();
      expect(decisionLifecycleResolvers.Query.participant).toBeDefined();
    });

    it('should have Mutation resolvers', () => {
      expect(decisionLifecycleResolvers.Mutation).toBeDefined();
      expect(decisionLifecycleResolvers.Mutation.captureDecision).toBeDefined();
      expect(decisionLifecycleResolvers.Mutation.createVoxel).toBeDefined();
      expect(decisionLifecycleResolvers.Mutation.requestInspection).toBeDefined();
      expect(decisionLifecycleResolvers.Mutation.createConsequence).toBeDefined();
      expect(decisionLifecycleResolvers.Mutation.createScheduleProposal).toBeDefined();
      expect(decisionLifecycleResolvers.Mutation.createParticipant).toBeDefined();
    });

    it('should have Subscription resolvers', () => {
      expect(decisionLifecycleResolvers.Subscription).toBeDefined();
      expect(decisionLifecycleResolvers.Subscription.decisionUpdated).toBeDefined();
      expect(decisionLifecycleResolvers.Subscription.voxelUpdated).toBeDefined();
    });
  });

  describe('Inspection Query', () => {
    it('should fetch inspection by id', async () => {
      const mockInspection = {
        id: 'insp-123',
        type: 'QUALITY',
        status: 'SCHEDULED',
      };
      prisma.inspection.findUnique.mockResolvedValue(mockInspection);

      const result = await decisionLifecycleResolvers.Query.inspection(
        {},
        { id: 'insp-123' },
        context
      );

      expect(result).toEqual(mockInspection);
    });
  });

  describe('Inspection Mutation', () => {
    it('should request an inspection', async () => {
      const mockInspection = {
        id: 'insp-new',
        status: 'SCHEDULED',
      };
      prisma.inspection.create.mockResolvedValue(mockInspection);

      const result = await decisionLifecycleResolvers.Mutation.requestInspection(
        {},
        {
          input: {
            projectId: 'proj-123',
            type: 'QUALITY',
            title: 'Quality Check',
            requestedById: 'user-123',
          },
        },
        context
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Consequence Query', () => {
    it('should fetch consequence analytics', async () => {
      const mockConsequences = [
        { type: 'COST', severity: 'HIGH', projected_impact: { costDelta: 5000 } },
        { type: 'SCHEDULE', severity: 'MEDIUM', projected_impact: { scheduleDelta: 3 } },
      ];
      prisma.consequence.findMany.mockResolvedValue(mockConsequences);

      const result = await decisionLifecycleResolvers.Query.consequenceAnalytics(
        {},
        { projectId: 'proj-123' },
        context
      );

      expect(result.totalConsequences).toBe(2);
      expect(result.totalCostImpact).toBe(5000);
      expect(result.totalScheduleImpact).toBe(3);
    });
  });

  describe('Schedule Proposal Mutation', () => {
    it('should create a schedule proposal', async () => {
      const mockProposal = {
        id: 'prop-new',
        status: 'DRAFT',
      };
      prisma.scheduleProposal.create.mockResolvedValue(mockProposal);

      const result = await decisionLifecycleResolvers.Mutation.createScheduleProposal(
        {},
        {
          input: {
            projectId: 'proj-123',
            type: 'RESCHEDULE',
            title: 'Delay Request',
            submittedById: 'user-123',
          },
        },
        context
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Authority Query', () => {
    it('should fetch authority graph', async () => {
      const mockParticipants = [
        { id: 'part-1', authority_level: 'FIELD' },
        { id: 'part-2', authority_level: 'PM' },
      ];
      prisma.participant.findMany.mockResolvedValue(mockParticipants);

      const result = await decisionLifecycleResolvers.Query.authorityGraph(
        {},
        { projectId: 'proj-123' },
        context
      );

      expect(result.projectId).toBe('proj-123');
      expect(result.levels).toHaveLength(7);
      expect(result.participants).toEqual(mockParticipants);
      expect(result.escalationPaths).toHaveLength(6);
    });

    it('should validate authority', async () => {
      const mockParticipant = {
        id: 'part-123',
        authority_level: 'FOREMAN',
      };
      prisma.participant.findUnique.mockResolvedValue(mockParticipant);

      const result = await decisionLifecycleResolvers.Query.validateAuthority(
        {},
        {
          participantId: 'part-123',
          decisionType: 'TECHNICAL',
          costImpact: 0,
          scheduleImpact: 0,
        },
        context
      );

      expect(result.valid).toBe(true);
      expect(result.canProceed).toBe(true);
      expect(result.currentLevel).toBe('FOREMAN');
    });

    it('should require escalation for insufficient authority', async () => {
      const mockParticipant = {
        id: 'part-123',
        authority_level: 'FIELD',
      };
      prisma.participant.findUnique.mockResolvedValue(mockParticipant);

      const result = await decisionLifecycleResolvers.Query.validateAuthority(
        {},
        {
          participantId: 'part-123',
          decisionType: 'BUDGET',
          costImpact: 50001,
          scheduleImpact: 0,
        },
        context
      );

      expect(result.valid).toBe(false);
      expect(result.escalationRequired).toBe(true);
      expect(result.requiredLevel).toBe('EXEC');
    });
  });

  describe('Participant Mutation', () => {
    it('should create a participant', async () => {
      const mockParticipant = {
        id: 'part-new',
        name: 'John Doe',
        authority_level: 'FOREMAN',
      };
      prisma.participant.create.mockResolvedValue(mockParticipant);

      const result = await decisionLifecycleResolvers.Mutation.createParticipant(
        {},
        {
          input: {
            projectId: 'proj-123',
            name: 'John Doe',
            email: 'john@example.com',
            role: 'FOREMAN',
            authorityLevel: 'FOREMAN',
          },
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.participant).toEqual(mockParticipant);
    });
  });
});

// ==============================================================================
// Custom Scalar Tests
// ==============================================================================

describe('Custom Scalars', () => {
  describe('DateTime', () => {
    it('should serialize Date to ISO string', () => {
      const date = new Date('2026-01-23T12:00:00Z');
      const result = decisionLifecycleResolvers.DateTime.serialize(date);
      expect(result).toBe('2026-01-23T12:00:00.000Z');
    });

    it('should parse ISO string to Date', () => {
      const result = decisionLifecycleResolvers.DateTime.parseValue('2026-01-23T12:00:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2026-01-23T12:00:00.000Z');
    });
  });

  describe('JSON', () => {
    it('should serialize JSON objects', () => {
      const obj = { key: 'value', nested: { num: 42 } };
      const result = decisionLifecycleResolvers.JSON.serialize(obj);
      expect(result).toEqual(obj);
    });

    it('should parse JSON values', () => {
      const obj = { test: true };
      const result = decisionLifecycleResolvers.JSON.parseValue(obj);
      expect(result).toEqual(obj);
    });
  });
});
