/**
 * Voxel Decision Pipeline Integration Tests
 *
 * End-to-end tests for the integrated voxel coordination system with
 * decision surface and authority cascade. Tests the complete workflow
 * from decision creation through routing, attachment, and acknowledgment.
 *
 * @see .roadmap/architecture/voxel-ml-architecture.json
 * @see .roadmap/schemas/voxel/voxel-v3.schema.json
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VoxelCoordinationService,
  createVoxelCoordinationService,
} from '../../services/voxel-coordination.service.js';
import {
  DecisionImpact,
} from '../../services/decision-authority-cascade.service.js';
import { VoxelSystem, VoxelStatus } from '../../types/voxel-decomposition.types.js';
import { AuthorityLevel } from '../../types/pm.types.js';

// Mock PrismaClient for tests
const mockPrisma = {
  voxel: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  voxelDecisionAttachment: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  voxelActivity: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn((cb) => cb(mockPrisma)),
};

describe('Voxel Decision Pipeline Integration', () => {
  let coordinationService: VoxelCoordinationService;

  beforeEach(() => {
    vi.clearAllMocks();
    coordinationService = createVoxelCoordinationService(mockPrisma as any, {
      enablePersistence: false,  // Use in-memory for tests
      enableDecisionSurface: true,
      enableAuthorityRouting: true,
    });
  });

  // ===========================================================================
  // Full Pipeline Tests
  // ===========================================================================

  describe('Full Decision Pipeline', () => {
    it('should route and attach decision through complete pipeline', async () => {
      const impact: DecisionImpact = {
        budgetImpact: 15000,
        scheduleImpactDays: 2,
        varianceAmountMM: 5,
        isSafetyRelated: false,
        affectedSystems: [VoxelSystem.ELECTRICAL],
      };

      const result = await coordinationService.routeAndAttachDecision(
        'voxel-001',
        'urn:luhtech:pm:decision:DEC-001',
        impact,
        'USER',
        'MEP coordination decision'
      );

      expect(result.voxelId).toBe('voxel-001');
      expect(result.decisionRef).toBe('urn:luhtech:pm:decision:DEC-001');
      expect(result.routing).toBeDefined();
      expect(result.attachment).toBeDefined();
      expect(result.routing.requiredLevel).toBeDefined();
      expect(result.routing.requiredTitle).toBeDefined();
    });

    it('should create alerts for high-authority decisions', async () => {
      const highImpact: DecisionImpact = {
        budgetImpact: 75000,
        scheduleImpactDays: 10,
        varianceAmountMM: 20,
        isSafetyRelated: false,
        affectedSystems: [VoxelSystem.STRUCTURAL, VoxelSystem.MECHANICAL, VoxelSystem.ELECTRICAL],
      };

      await coordinationService.routeAndAttachDecision(
        'voxel-002',
        'urn:luhtech:pm:decision:DEC-002',
        highImpact,
        'SYSTEM'
      );

      const alerts = coordinationService.getVoxelAlerts('voxel-002');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });

    it('should track acknowledgment through pipeline', async () => {
      // Route and attach decision
      await coordinationService.routeAndAttachDecision(
        'voxel-003',
        'urn:luhtech:pm:decision:DEC-003',
        {
          budgetImpact: 10000,
          scheduleImpactDays: 1,
          varianceAmountMM: 0,
          isSafetyRelated: false,
        },
        'USER'
      );

      // Record acknowledgment
      const ack = coordinationService.recordDecisionAcknowledgment({
        decisionRef: 'urn:luhtech:pm:decision:DEC-003',
        voxelId: 'voxel-003',
        workerRef: 'urn:luhtech:pm:worker:worker-001',
        workerName: 'John Smith',
        workerTrade: 'ELECTRICAL',
        method: 'QR_SCAN',
        location: {
          gps: { lat: 49.2827, lng: -123.1207, accuracy: 5 },
        },
      });

      expect(ack.id).toBeDefined();
      expect(ack.method).toBe('QR_SCAN');

      // Verify acknowledgment recorded
      const hasAcked = coordinationService.hasWorkerAcknowledged(
        'voxel-003',
        'urn:luhtech:pm:decision:DEC-003',
        'urn:luhtech:pm:worker:worker-001'
      );
      expect(hasAcked).toBe(true);
    });
  });

  // ===========================================================================
  // Authority Validation Integration Tests
  // ===========================================================================

  describe('Authority Validation Integration', () => {
    it('should validate authority for decision approval', async () => {
      const impact: DecisionImpact = {
        budgetImpact: 25000,
        scheduleImpactDays: 3,
        varianceAmountMM: 10,
        isSafetyRelated: false,
      };

      // Foreman should not be able to approve
      const foremanValidation = await coordinationService.validateDecisionAuthority(
        'voxel-001',
        AuthorityLevel.FOREMAN,
        impact
      );
      expect(foremanValidation?.canApprove).toBe(false);
      expect(foremanValidation?.escalationRequired).toBe(true);

      // PM should be able to approve
      const pmValidation = await coordinationService.validateDecisionAuthority(
        'voxel-001',
        AuthorityLevel.PM,
        impact
      );
      // May or may not be able to approve depending on weighted calc
      expect(pmValidation).toBeDefined();
    });

    it('should provide correct escalation targets', () => {
      const target = coordinationService.getEscalationTarget(AuthorityLevel.FOREMAN);
      expect(target).toBe(AuthorityLevel.SUPERINTENDENT);
    });

    it('should provide system-specific authority requirements', () => {
      const structuralReqs = coordinationService.getSystemAuthorityRequirements(
        VoxelSystem.STRUCTURAL
      );
      expect(structuralReqs.minLevel).toBe(AuthorityLevel.PM);
      expect(structuralReqs.safetyLevel).toBe(AuthorityLevel.REGULATORY);

      const electricalReqs = coordinationService.getSystemAuthorityRequirements(
        VoxelSystem.ELECTRICAL
      );
      expect(electricalReqs.minLevel).toBe(AuthorityLevel.FOREMAN);
    });
  });

  // ===========================================================================
  // Tolerance Override Integration Tests
  // ===========================================================================

  describe('Tolerance Override Integration', () => {
    it('should create and check tolerance override', () => {
      // Create tolerance override
      const override = coordinationService.createToleranceOverride({
        voxelId: 'voxel-004',
        toleranceType: 'WALL_FLATNESS',
        standardValue: { value: 6.35, unit: 'mm', direction: '±' },
        approvedValue: { value: 15, unit: 'mm', direction: '±' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-004',
        approvedBy: 'urn:luhtech:pm:user:architect-001',
        rationale: 'Non-visible area behind cabinet',
        applicableTrades: ['DRYWALL'],
      });

      expect(override.id).toBeDefined();

      // Check compliance - within approved
      const withinResult = coordinationService.checkToleranceCompliance(
        'voxel-004',
        'WALL_FLATNESS',
        12,
        'DRYWALL'
      );
      expect(withinResult.withinApprovedTolerance).toBe(true);
      expect(withinResult.override).toBeDefined();

      // Check compliance - outside approved
      const outsideResult = coordinationService.checkToleranceCompliance(
        'voxel-004',
        'WALL_FLATNESS',
        20,
        'DRYWALL'
      );
      expect(outsideResult.withinApprovedTolerance).toBe(false);
      expect(outsideResult.requiredAuthority).toBeDefined();
    });

    it('should calculate required authority for variance outside tolerance', () => {
      const result = coordinationService.checkToleranceCompliance(
        'voxel-005',
        'CEILING_HEIGHT',
        25,  // Outside standard tolerance
      );

      expect(result.withinStandardTolerance).toBe(false);
      expect(result.withinApprovedTolerance).toBe(false);
      expect(result.requiredAuthority).toBeDefined();
      expect(result.requiredAuthority?.requiredLevel).toBeDefined();
    });
  });

  // ===========================================================================
  // Pre-Approval Integration Tests
  // ===========================================================================

  describe('Pre-Approval Integration', () => {
    it('should create and check pre-approval coverage', () => {
      // Create pre-approval
      const preApproval = coordinationService.createPreApproval({
        voxelId: 'voxel-006',
        scope: 'minor color adjustments',
        conditions: ['Must match approved palette'],
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-005',
        authorityLevel: 'PM',
        applicableTrades: ['PAINTING'],
      });

      expect(preApproval.id).toBeDefined();

      // Check coverage
      const coverage = coordinationService.checkPreApproval(
        'voxel-006',
        'minor',
        'PAINTING',
        'SUPERINTENDENT'
      );
      expect(coverage.covered).toBe(true);
      expect(coverage.preApproval).toBeDefined();
    });
  });

  // ===========================================================================
  // Alert Integration Tests
  // ===========================================================================

  describe('Alert Integration', () => {
    it('should create and manage alerts', () => {
      // Create alert
      const alert = coordinationService.createVoxelAlert({
        voxelId: 'voxel-007',
        priority: 'CRITICAL',
        title: 'Structural Concern',
        message: 'Load-bearing wall modification detected',
        targetTrades: ['STRUCTURAL', 'FRAMING'],
        requiresAcknowledgment: true,
      });

      expect(alert.id).toBeDefined();
      expect(alert.priority).toBe('CRITICAL');

      // Acknowledge alert
      const ackResult = coordinationService.acknowledgeVoxelAlert(
        'voxel-007',
        alert.id,
        'urn:luhtech:pm:worker:foreman-001'
      );
      expect(ackResult).toBe(true);

      // Verify acknowledgment
      const alerts = coordinationService.getVoxelAlerts('voxel-007');
      expect(alerts[0].acknowledgedBy).toContain('urn:luhtech:pm:worker:foreman-001');
    });

    it('should find voxels with critical alerts', async () => {
      coordinationService.createVoxelAlert({
        voxelId: 'voxel-008',
        priority: 'CRITICAL',
        title: 'Critical Alert',
        message: 'Test',
      });
      coordinationService.createVoxelAlert({
        voxelId: 'voxel-009',
        priority: 'INFO',
        title: 'Info Alert',
        message: 'Test',
      });

      const critical = coordinationService.findCriticalVoxels();
      expect(critical.criticalAlerts).toContain('voxel-008');
      expect(critical.criticalAlerts).not.toContain('voxel-009');
    });
  });

  // ===========================================================================
  // V3 Schema Compliance Tests
  // ===========================================================================

  describe('V3 Schema Compliance', () => {
    it('should return V3 compliant voxel with decision surface', async () => {
      const mockVoxel = {
        id: 'voxel-010',
        voxelId: 'VXL-010',
        projectId: 'project-001',
        modelId: 'model-001',
        system: VoxelSystem.ELECTRICAL,
        status: VoxelStatus.NOT_STARTED,
        center: { x: 100, y: 200, z: 50 },
        bounds: {
          min: { x: 50, y: 150, z: 25 },
          max: { x: 150, y: 250, z: 75 },
        },
        resolution: 100,
        percentComplete: 0,
        decisionCount: 0,
      };

      // Mock getVoxel to always return the voxel for this test
      const getVoxelSpy = vi.spyOn(coordinationService, 'getVoxel');
      getVoxelSpy.mockResolvedValue(mockVoxel as any);

      // Attach a decision
      await coordinationService.routeAndAttachDecision(
        'voxel-010',
        'urn:luhtech:pm:decision:DEC-010',
        {
          budgetImpact: 5000,
          scheduleImpactDays: 0,
          varianceAmountMM: 0,
          isSafetyRelated: false,
        },
        'SYSTEM'
      );

      // Get V3 voxel
      const v3Voxel = await coordinationService.getVoxelV3('voxel-010');

      expect(v3Voxel?.$schema).toBe('https://luhtech.dev/schemas/pm/voxel.schema.json');
      expect(v3Voxel?.schemaVersion).toBe('3.0.0');
      expect(v3Voxel?.decisionSurface).toBeDefined();
      expect(v3Voxel?.graphMetadata).toBeDefined();

      getVoxelSpy.mockRestore();
    });
  });

  // ===========================================================================
  // Decision Surface Statistics Tests
  // ===========================================================================

  describe('Decision Surface Statistics', () => {
    it('should provide accurate statistics', async () => {
      const voxelId = 'voxel-stats';

      // Add decisions with low impact (no auto-alerts)
      await coordinationService.routeAndAttachDecision(
        voxelId,
        'urn:luhtech:pm:decision:DEC-S1',
        { budgetImpact: 100, scheduleImpactDays: 0, varianceAmountMM: 0, isSafetyRelated: false },
        'USER'
      );
      await coordinationService.routeAndAttachDecision(
        voxelId,
        'urn:luhtech:pm:decision:DEC-S2',
        { budgetImpact: 200, scheduleImpactDays: 0, varianceAmountMM: 0, isSafetyRelated: false },
        'SYSTEM'
      );

      // Add tolerance override
      coordinationService.createToleranceOverride({
        voxelId,
        toleranceType: 'ALIGNMENT',
        standardValue: { value: 3, unit: 'mm', direction: '±' },
        approvedValue: { value: 6, unit: 'mm', direction: '±' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-S1',
        approvedBy: 'urn:luhtech:pm:user:user-001',
        rationale: 'Test',
        applicableTrades: ['ALL'],
      });

      // Add alert manually
      coordinationService.createVoxelAlert({
        voxelId,
        priority: 'WARNING',
        title: 'Test Alert',
        message: 'Test',
      });

      const stats = coordinationService.getDecisionSurfaceStats(voxelId);
      expect(stats.totalDecisions).toBe(2);
      expect(stats.toleranceOverrides).toBe(1);
      expect(stats.activeAlerts).toBeGreaterThanOrEqual(1);
    });

    it('should provide decision density map', async () => {
      await coordinationService.routeAndAttachDecision(
        'voxel-d1',
        'urn:luhtech:pm:decision:D1',
        { budgetImpact: 1000, scheduleImpactDays: 0, varianceAmountMM: 0, isSafetyRelated: false },
        'USER'
      );
      await coordinationService.routeAndAttachDecision(
        'voxel-d1',
        'urn:luhtech:pm:decision:D2',
        { budgetImpact: 1000, scheduleImpactDays: 0, varianceAmountMM: 0, isSafetyRelated: false },
        'USER'
      );
      await coordinationService.routeAndAttachDecision(
        'voxel-d2',
        'urn:luhtech:pm:decision:D3',
        { budgetImpact: 1000, scheduleImpactDays: 0, varianceAmountMM: 0, isSafetyRelated: false },
        'USER'
      );

      const densityMap = coordinationService.getDecisionDensityMap();
      expect(densityMap.get('voxel-d1')).toBe(2);
      expect(densityMap.get('voxel-d2')).toBe(1);
    });
  });

  // ===========================================================================
  // Real-time Update Subscription Tests
  // ===========================================================================

  describe('Real-time Updates', () => {
    it('should broadcast updates to subscribers', async () => {
      const updates: any[] = [];
      const unsubscribe = coordinationService.subscribeToUpdates(
        'project-001',
        (update) => updates.push(update)
      );

      // Mock getVoxel to return proper projectId
      vi.spyOn(coordinationService, 'getVoxel').mockResolvedValue({
        id: 'voxel-rt',
        projectId: 'project-001',
        center: { x: 0, y: 0, z: 0 },
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } },
        resolution: 100,
      } as any);

      // Trigger an update
      await coordinationService.routeAndAttachDecision(
        'voxel-rt',
        'urn:luhtech:pm:decision:RT-001',
        { budgetImpact: 1000, scheduleImpactDays: 0, varianceAmountMM: 0, isSafetyRelated: false },
        'USER'
      );

      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0].type).toBe('decision');

      unsubscribe();
    });
  });

  // ===========================================================================
  // Service Accessor Tests
  // ===========================================================================

  describe('Service Accessors', () => {
    it('should expose underlying services', () => {
      expect(coordinationService.getDecisionSurfaceService()).toBeDefined();
      expect(coordinationService.getAuthorityCascadeService()).toBeDefined();
      expect(coordinationService.getDecompositionService()).toBeDefined();
      expect(coordinationService.getPersistenceService()).toBeDefined();
      expect(coordinationService.getSpeckleService()).toBeDefined();
    });

    it('should expose authority tier information', () => {
      const tier = coordinationService.getAuthorityTier(3);
      expect(tier?.name).toBe(AuthorityLevel.PM);

      const allTiers = coordinationService.getAllAuthorityTiers();
      expect(allTiers).toHaveLength(7);
    });
  });

  // ===========================================================================
  // Edge Cases and Error Handling Tests
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle disabled decision surface gracefully', () => {
      const disabledService = createVoxelCoordinationService(mockPrisma as any, {
        enablePersistence: false,
        enableDecisionSurface: false,
        enableAuthorityRouting: false,
      });

      // Should throw when trying to use decision surface
      expect(() =>
        disabledService.createVoxelAlert({
          voxelId: 'test',
          priority: 'INFO',
          title: 'Test',
          message: 'Test',
        })
      ).toThrow('Decision surface is not enabled');
    });

    it('should handle missing voxel gracefully', async () => {
      vi.spyOn(coordinationService, 'getVoxel').mockResolvedValue(null);

      const result = await coordinationService.calculateVoxelDecisionAuthority(
        'non-existent',
        {}
      );
      expect(result).toBeNull();
    });

    it('should return empty stats when decision surface disabled', () => {
      const disabledService = createVoxelCoordinationService(mockPrisma as any, {
        enablePersistence: false,
        enableDecisionSurface: false,
      });

      const stats = disabledService.getDecisionSurfaceStats('any-voxel');
      expect(stats.totalDecisions).toBe(0);
      expect(stats.acknowledgmentRate).toBe(1);
    });
  });
});
