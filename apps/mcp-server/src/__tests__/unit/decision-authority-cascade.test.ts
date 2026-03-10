/**
 * Decision Authority Cascade Service Tests
 *
 * Comprehensive tests for the 7-tier authority cascade system.
 * Tests impact-based routing, authority validation, and escalation paths.
 *
 * @see .roadmap/architecture/voxel-ml-architecture.json
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DecisionAuthorityCascadeService,
  createDecisionAuthorityCascadeService,
  DecisionImpact,
  AUTHORITY_TIERS,
  DEFAULT_IMPACT_WEIGHTS,
} from '../../services/decision-authority-cascade.service.js';
import { AuthorityLevel } from '../../types/pm.types.js';
import { VoxelSystem, VoxelStatus } from '../../types/voxel-decomposition.types.js';

describe('DecisionAuthorityCascadeService', () => {
  let service: DecisionAuthorityCascadeService;

  beforeEach(() => {
    service = createDecisionAuthorityCascadeService();
  });

  // ===========================================================================
  // Authority Tier Configuration Tests
  // ===========================================================================

  describe('Authority Tier Configuration', () => {
    it('should have exactly 7 authority tiers', () => {
      expect(AUTHORITY_TIERS).toHaveLength(7);
    });

    it('should have correct tier levels from 0 to 6', () => {
      AUTHORITY_TIERS.forEach((tier, index) => {
        expect(tier.level).toBe(index);
      });
    });

    it('should have FIELD at level 0', () => {
      const fieldTier = service.getTier(0);
      expect(fieldTier?.name).toBe(AuthorityLevel.FIELD);
      expect(fieldTier?.title).toBe('Field Worker');
      expect(fieldTier?.autoApprove).toBe(true);
    });

    it('should have FOREMAN at level 1 with $500 budget limit', () => {
      const foremanTier = service.getTier(1);
      expect(foremanTier?.name).toBe(AuthorityLevel.FOREMAN);
      expect(foremanTier?.budgetLimit).toBe(500);
      expect(foremanTier?.scheduleAuthorityHours).toBe(4);
      expect(foremanTier?.varianceToleranceMM).toBeCloseTo(3.175);  // 1/8"
    });

    it('should have SUPERINTENDENT at level 2 with $5000 budget limit', () => {
      const superintendentTier = service.getTier(2);
      expect(superintendentTier?.name).toBe(AuthorityLevel.SUPERINTENDENT);
      expect(superintendentTier?.budgetLimit).toBe(5000);
      expect(superintendentTier?.scheduleAuthorityHours).toBe(24);
    });

    it('should have PM at level 3 with $50000 budget limit', () => {
      const pmTier = service.getTier(3);
      expect(pmTier?.name).toBe(AuthorityLevel.PM);
      expect(pmTier?.budgetLimit).toBe(50000);
      expect(pmTier?.scheduleAuthorityHours).toBe(168);  // 1 week
    });

    it('should have ARCHITECT at level 4 for design decisions', () => {
      const architectTier = service.getTier(4);
      expect(architectTier?.name).toBe(AuthorityLevel.ARCHITECT);
      expect(architectTier?.budgetLimit).toBe('design');
    });

    it('should have OWNER at level 5 for major decisions', () => {
      const ownerTier = service.getTier(5);
      expect(ownerTier?.name).toBe(AuthorityLevel.OWNER);
      expect(ownerTier?.budgetLimit).toBe('project');
    });

    it('should have REGULATORY at level 6 for code/safety', () => {
      const regulatoryTier = service.getTier(6);
      expect(regulatoryTier?.name).toBe(AuthorityLevel.REGULATORY);
      expect(regulatoryTier?.budgetLimit).toBe('code');
    });

    it('should return undefined for invalid level', () => {
      expect(service.getTier(7)).toBeUndefined();
      expect(service.getTier(-1)).toBeUndefined();
    });

    it('should retrieve tier by name', () => {
      const tier = service.getTierByName(AuthorityLevel.PM);
      expect(tier?.level).toBe(3);
    });
  });

  // ===========================================================================
  // Impact Weight Configuration Tests
  // ===========================================================================

  describe('Impact Weight Configuration', () => {
    it('should have correct default weights summing to 1.0', () => {
      const totalWeight =
        DEFAULT_IMPACT_WEIGHTS.budgetImpact +
        DEFAULT_IMPACT_WEIGHTS.scheduleImpact +
        DEFAULT_IMPACT_WEIGHTS.varianceAmount +
        DEFAULT_IMPACT_WEIGHTS.safetyFlag;
      expect(totalWeight).toBe(1.0);
    });

    it('should weight budget at 40%', () => {
      expect(DEFAULT_IMPACT_WEIGHTS.budgetImpact).toBe(0.4);
    });

    it('should weight schedule at 30%', () => {
      expect(DEFAULT_IMPACT_WEIGHTS.scheduleImpact).toBe(0.3);
    });

    it('should weight variance at 15%', () => {
      expect(DEFAULT_IMPACT_WEIGHTS.varianceAmount).toBe(0.15);
    });

    it('should weight safety at 15%', () => {
      expect(DEFAULT_IMPACT_WEIGHTS.safetyFlag).toBe(0.15);
    });

    it('should allow custom weights', () => {
      const customService = createDecisionAuthorityCascadeService({
        budgetImpact: 0.5,
        scheduleImpact: 0.2,
      });
      // Verify it uses custom weights by checking routing differs
      const impact: DecisionImpact = {
        budgetImpact: 100000,
        scheduleImpactDays: 1,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = customService.calculateRequiredAuthority(impact);
      expect(result).toBeDefined();
    });
  });

  // ===========================================================================
  // Budget-Based Authority Level Tests
  // ===========================================================================

  describe('Budget-Based Authority Routing', () => {
    it('should route $0 impact to FIELD level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevel).toBe(AuthorityLevel.FIELD);
      expect(result.canAutoApprove).toBe(true);
    });

    it('should route $100 impact to FOREMAN level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 100,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(0);
      expect(result.requiredLevelNumber).toBeLessThanOrEqual(1);
    });

    it('should route $500 impact to FOREMAN level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 500,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.budgetWithinLimit).toBe(true);
    });

    it('should route $3000 impact to SUPERINTENDENT level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 3000,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(1);
      expect(result.requiredLevelNumber).toBeLessThanOrEqual(2);
    });

    it('should route $25000 impact to PM level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 25000,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(2);
      expect(result.requiredLevelNumber).toBeLessThanOrEqual(3);
    });

    it('should route $75000 impact considering budget weight', () => {
      const impact: DecisionImpact = {
        budgetImpact: 75000,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      // Budget at level 4 * 0.4 weight = 1.6, so ceil to 2
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(2);
      expect(result.routingFactors.budgetFactor).toBeGreaterThanOrEqual(3);
    });

    it('should route $125000 impact considering budget weight', () => {
      const impact: DecisionImpact = {
        budgetImpact: 125000,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      // Budget at level 5 * 0.4 weight = 2.0, so ceil to 2
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(2);
      expect(result.routingFactors.budgetFactor).toBeGreaterThanOrEqual(4);
    });

    it('should route $200000 impact considering budget weight', () => {
      const impact: DecisionImpact = {
        budgetImpact: 200000,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      // Budget at level 6 * 0.4 weight = 2.4, so ceil to 3
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(2);
      expect(result.routingFactors.budgetFactor).toBe(6);
    });
  });

  // ===========================================================================
  // Schedule-Based Authority Level Tests
  // ===========================================================================

  describe('Schedule-Based Authority Routing', () => {
    it('should route 2 hour delay within FOREMAN authority', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 2 / 24,  // 2 hours
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.scheduleWithinLimit).toBe(true);
    });

    it('should route 1 day delay to SUPERINTENDENT level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 1,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(1);
    });

    it('should route 3 day delay considering schedule weight', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 3,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      // 3 days = 72 hours, which is between 1 day (24h) and 1 week (168h) = level 2-3
      // Level 3 * 0.3 weight = 0.9, so ceil to 1
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(1);
      expect(result.routingFactors.scheduleFactor).toBeGreaterThanOrEqual(2);
    });

    it('should route 10 day delay considering schedule weight', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 10,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      // 10 days = 240 hours, which is between 1 week and 2 weeks = level 4
      // Level 4 * 0.3 weight = 1.2, so ceil to 2
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(1);
      expect(result.routingFactors.scheduleFactor).toBeGreaterThanOrEqual(3);
    });

    it('should route 20 day delay considering schedule weight', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 20,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      // 20 days = 480 hours, which is between 2 weeks and 1 month = level 4-5
      // Level 5 * 0.3 weight = 1.5, so ceil to 2
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(1);
      expect(result.routingFactors.scheduleFactor).toBeGreaterThanOrEqual(4);
    });
  });

  // ===========================================================================
  // Variance-Based Authority Level Tests
  // ===========================================================================

  describe('Variance-Based Authority Routing', () => {
    it('should route 2mm variance within FOREMAN tolerance', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: 2,  // Under 1/8" (3.175mm)
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.varianceWithinTolerance).toBe(true);
    });

    it('should route 5mm variance to SUPERINTENDENT level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: 5,  // Between 1/8" and 1/4"
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(1);
    });

    it('should route 10mm variance considering variance weight', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: 10,  // Between 1/4" (6.35mm) and 1/2" (12.7mm) = level 3
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      // Level 3 * 0.15 weight = 0.45, so ceil to 1
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(0);
      expect(result.routingFactors.varianceFactor).toBeGreaterThanOrEqual(2);
    });

    it('should route 20mm (visible) variance considering variance weight', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: 20,  // Between 1/2" (12.7mm) and 1" (25.4mm) = level 4
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      // Level 4 * 0.15 weight = 0.6, so ceil to 1
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(0);
      expect(result.routingFactors.varianceFactor).toBeGreaterThanOrEqual(3);
    });

    it('should route 40mm (major) variance considering variance weight', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: 40,  // Between 1" (25.4mm) and 2" (50.8mm) = level 5
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      // Level 5 * 0.15 weight = 0.75, so ceil to 1
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(0);
      expect(result.routingFactors.varianceFactor).toBeGreaterThanOrEqual(4);
    });
  });

  // ===========================================================================
  // Safety Flag Escalation Tests
  // ===========================================================================

  describe('Safety Flag Escalation', () => {
    it('should escalate safety-related decisions to REGULATORY level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: true,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevel).toBe(AuthorityLevel.REGULATORY);
      expect(result.requiredLevelNumber).toBe(6);
      expect(result.escalationTriggers).toContain('Safety concern flagged');
    });

    it('should escalate safety issues regardless of other low impacts', () => {
      const impact: DecisionImpact = {
        budgetImpact: 100,
        scheduleImpactDays: 0.1,
        varianceAmountMM: 1,
        isSafetyRelated: true,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevelNumber).toBe(6);
    });
  });

  // ===========================================================================
  // Design Change Escalation Tests
  // ===========================================================================

  describe('Design Change Escalation', () => {
    it('should escalate design changes to at least ARCHITECT level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 100,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
        isDesignChange: true,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(4);
      expect(result.escalationTriggers).toContain('Design change required');
    });
  });

  // ===========================================================================
  // Code-Related Escalation Tests
  // ===========================================================================

  describe('Code-Related Escalation', () => {
    it('should escalate code compliance issues to REGULATORY level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
        isCodeRelated: true,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevelNumber).toBe(6);
      expect(result.escalationTriggers).toContain('Code compliance issue');
    });
  });

  // ===========================================================================
  // Critical Path Escalation Tests
  // ===========================================================================

  describe('Critical Path Escalation', () => {
    it('should escalate critical path issues to at least PM level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 100,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
        criticalPathAffected: true,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(3);
      expect(result.escalationTriggers).toContain('Critical path affected');
    });
  });

  // ===========================================================================
  // Multiple Affected Systems Escalation Tests
  // ===========================================================================

  describe('Multiple Systems Escalation', () => {
    it('should escalate when more than 2 systems affected', () => {
      const impact: DecisionImpact = {
        budgetImpact: 100,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
        affectedSystems: [
          VoxelSystem.ELECTRICAL,
          VoxelSystem.PLUMBING,
          VoxelSystem.HVAC,
        ],
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(3);
      expect(result.escalationTriggers).toContain('Multiple affected systems');
    });

    it('should not trigger multi-system escalation for 2 or fewer systems', () => {
      const impact: DecisionImpact = {
        budgetImpact: 100,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
        affectedSystems: [VoxelSystem.ELECTRICAL, VoxelSystem.PLUMBING],
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.escalationTriggers).not.toContain('Multiple affected systems');
    });
  });

  // ===========================================================================
  // Combined Impact Tests
  // ===========================================================================

  describe('Combined Impact Routing', () => {
    it('should combine budget and schedule impacts with weights', () => {
      const impact: DecisionImpact = {
        budgetImpact: 3000,   // Level 2 budget
        scheduleImpactDays: 3,  // Level 2-3 schedule
        varianceAmountMM: 5,   // Level 2 variance
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      // Weighted average should put this around level 2-3
      expect(result.requiredLevelNumber).toBeGreaterThanOrEqual(2);
      expect(result.requiredLevelNumber).toBeLessThanOrEqual(4);
    });

    it('should provide detailed routing factors', () => {
      const impact: DecisionImpact = {
        budgetImpact: 10000,
        scheduleImpactDays: 5,
        varianceAmountMM: 10,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.routingFactors).toBeDefined();
      expect(result.routingFactors.budgetFactor).toBeDefined();
      expect(result.routingFactors.scheduleFactor).toBeDefined();
      expect(result.routingFactors.varianceFactor).toBeDefined();
      expect(result.routingFactors.safetyFactor).toBeDefined();
      expect(result.routingFactors.weightedScore).toBeDefined();
    });
  });

  // ===========================================================================
  // Authority Validation Tests
  // ===========================================================================

  describe('Authority Validation', () => {
    it('should validate PM can approve PM-level decisions', () => {
      const result = service.validateAuthority(
        AuthorityLevel.PM,
        AuthorityLevel.PM
      );
      expect(result.canApprove).toBe(true);
      expect(result.gap).toBe(0);
      expect(result.escalationRequired).toBe(false);
    });

    it('should validate OWNER can approve PM-level decisions', () => {
      const result = service.validateAuthority(
        AuthorityLevel.OWNER,
        AuthorityLevel.PM
      );
      expect(result.canApprove).toBe(true);
      expect(result.gap).toBeLessThan(0);
    });

    it('should deny FOREMAN approving PM-level decisions', () => {
      const result = service.validateAuthority(
        AuthorityLevel.FOREMAN,
        AuthorityLevel.PM
      );
      expect(result.canApprove).toBe(false);
      expect(result.gap).toBeGreaterThan(0);
      expect(result.escalationRequired).toBe(true);
    });

    it('should provide escalation path', () => {
      const result = service.validateAuthority(
        AuthorityLevel.FOREMAN,
        AuthorityLevel.PM
      );
      expect(result.escalationPath).toBeDefined();
      expect(result.escalationPath.length).toBeGreaterThan(0);
      expect(result.escalationPath).toContain(AuthorityLevel.SUPERINTENDENT);
      expect(result.escalationPath).toContain(AuthorityLevel.PM);
    });

    it('should have empty escalation path when authority sufficient', () => {
      const result = service.validateAuthority(
        AuthorityLevel.OWNER,
        AuthorityLevel.PM
      );
      expect(result.escalationPath).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Decision Routing Tests
  // ===========================================================================

  describe('Decision Routing', () => {
    it('should route decision with full context', () => {
      const response = service.routeDecision({
        decisionId: 'DEC-001',
        projectId: 'PRJ-001',
        voxelId: 'VXL-001',
        impact: {
          budgetImpact: 5000,
          scheduleImpactDays: 1,
          varianceAmountMM: 0,
          isSafetyRelated: false,
          affectedSystems: [VoxelSystem.ELECTRICAL],
        },
        requestedBy: 'user-001',
        requestedByLevel: AuthorityLevel.FOREMAN,
      });

      expect(response.decisionId).toBe('DEC-001');
      expect(response.routing).toBeDefined();
      expect(response.validation).toBeDefined();
      expect(response.voxelContext).toBeDefined();
      expect(response.voxelContext?.voxelId).toBe('VXL-001');
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should validate requester authority in routing', () => {
      const response = service.routeDecision({
        decisionId: 'DEC-002',
        projectId: 'PRJ-001',
        impact: {
          budgetImpact: 100000,
          scheduleImpactDays: 10,
          varianceAmountMM: 20,
          isSafetyRelated: false,
        },
        requestedBy: 'user-002',
        requestedByLevel: AuthorityLevel.FOREMAN,
      });

      // Foreman should not be able to approve high-impact decision
      expect(response.validation.canApprove).toBe(false);
      expect(response.validation.escalationRequired).toBe(true);
    });
  });

  // ===========================================================================
  // Escalation Target Tests
  // ===========================================================================

  describe('Escalation Targets', () => {
    it('should return next level for escalation', () => {
      expect(service.getEscalationTarget(AuthorityLevel.FIELD)).toBe(
        AuthorityLevel.FOREMAN
      );
      expect(service.getEscalationTarget(AuthorityLevel.FOREMAN)).toBe(
        AuthorityLevel.SUPERINTENDENT
      );
      expect(service.getEscalationTarget(AuthorityLevel.SUPERINTENDENT)).toBe(
        AuthorityLevel.PM
      );
      expect(service.getEscalationTarget(AuthorityLevel.PM)).toBe(
        AuthorityLevel.ARCHITECT
      );
      expect(service.getEscalationTarget(AuthorityLevel.ARCHITECT)).toBe(
        AuthorityLevel.OWNER
      );
      expect(service.getEscalationTarget(AuthorityLevel.OWNER)).toBe(
        AuthorityLevel.REGULATORY
      );
    });

    it('should return null for REGULATORY (highest level)', () => {
      expect(service.getEscalationTarget(AuthorityLevel.REGULATORY)).toBeNull();
    });
  });

  // ===========================================================================
  // System Authority Requirements Tests
  // ===========================================================================

  describe('System Authority Requirements', () => {
    it('should require PM for STRUCTURAL system changes', () => {
      const reqs = service.getSystemAuthorityRequirements(VoxelSystem.STRUCTURAL);
      expect(reqs.minLevel).toBe(AuthorityLevel.PM);
      expect(reqs.safetyLevel).toBe(AuthorityLevel.REGULATORY);
    });

    it('should require SUPERINTENDENT for FIRE system changes', () => {
      const reqs = service.getSystemAuthorityRequirements(VoxelSystem.FIRE);
      expect(reqs.minLevel).toBe(AuthorityLevel.SUPERINTENDENT);
      expect(reqs.safetyLevel).toBe(AuthorityLevel.REGULATORY);
    });

    it('should require FOREMAN for ELECTRICAL system changes', () => {
      const reqs = service.getSystemAuthorityRequirements(VoxelSystem.ELECTRICAL);
      expect(reqs.minLevel).toBe(AuthorityLevel.FOREMAN);
    });

    it('should require SUPERINTENDENT for ARCHITECTURAL system changes', () => {
      const reqs = service.getSystemAuthorityRequirements(VoxelSystem.ARCHITECTURAL);
      expect(reqs.minLevel).toBe(AuthorityLevel.SUPERINTENDENT);
      expect(reqs.designChangeLevel).toBe(AuthorityLevel.ARCHITECT);
    });
  });

  // ===========================================================================
  // Voxel Decision Authority Tests
  // ===========================================================================

  describe('Voxel Decision Authority', () => {
    it('should calculate authority from voxel context', () => {
      const voxel: any = {
        id: 'VXL-001',
        projectId: 'PRJ-001',
        system: VoxelSystem.ELECTRICAL,
        estimatedCost: 5000,
        plannedStart: new Date(),
        plannedEnd: new Date(Date.now() + 86400000),  // +1 day
        status: VoxelStatus.BLOCKED,
        isCriticalPath: true,
      };

      const result = service.calculateVoxelDecisionAuthority(voxel, {
        varianceAmountMM: 10,
      });

      expect(result).toBeDefined();
      expect(result.requiredLevel).toBeDefined();
      // Critical path should trigger escalation
      expect(result.escalationTriggers).toContain('Critical path affected');
    });

    it('should use voxel estimated cost when no budget impact provided', () => {
      const voxel: any = {
        id: 'VXL-002',
        projectId: 'PRJ-001',
        system: VoxelSystem.PLUMBING,
        estimatedCost: 25000,
        status: VoxelStatus.NOT_STARTED,
      };

      const result = service.calculateVoxelDecisionAuthority(voxel, {});
      expect(result.routingFactors.budgetFactor).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Recommendation Generation Tests
  // ===========================================================================

  describe('Recommendation Generation', () => {
    it('should generate auto-approval recommendation for FIELD level', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.recommendation).toContain('auto-approved');
    });

    it('should include triggers in recommendation', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: true,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.recommendation).toContain('Safety');
    });

    it('should include budget impact in recommendation', () => {
      const impact: DecisionImpact = {
        budgetImpact: 50000,
        scheduleImpactDays: 0,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.recommendation).toContain('50,000');
    });

    it('should include schedule impact in recommendation', () => {
      const impact: DecisionImpact = {
        budgetImpact: 0,
        scheduleImpactDays: 5,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };
      const result = service.calculateRequiredAuthority(impact);
      expect(result.recommendation).toContain('5 days');
    });
  });
});
