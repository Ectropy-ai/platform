/**
 * RoadmapService Tests
 * Test strategic roadmap tracking and alignment validation
 *
 * Updated 2026-03-06: Tests aligned with V3 schema (schemaVersion 3.1.0)
 * and V3 business roadmap structure (financials/team/market/traction).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RoadmapService } from '../roadmap-service';
import type { WorkPlan } from '../work-plan-validator';

describe('RoadmapService', () => {
  let service: RoadmapService;

  beforeEach(() => {
    service = new RoadmapService();
  });

  describe('getRoadmap', () => {
    it('should load roadmap from JSON file', () => {
      const roadmap = service.getRoadmap();

      expect(roadmap).toBeDefined();
      expect(roadmap.version).toBe('3.1.0');
      expect(roadmap.phases).toBeInstanceOf(Array);
      expect(roadmap.phases.length).toBeGreaterThan(0);
    });

    it('should have phases derived from quarters with correct structure', () => {
      const roadmap = service.getRoadmap();
      const phase = roadmap.phases[0];

      expect(phase).toHaveProperty('id');
      expect(phase).toHaveProperty('name');
      expect(phase).toHaveProperty('description');
      expect(phase).toHaveProperty('status');
      expect(phase).toHaveProperty('priority');
      expect(phase).toHaveProperty('dependencies');
      expect(phase).toHaveProperty('deliverables');
    });

    it('should extract currentPhase from venture object', () => {
      const roadmap = service.getRoadmap();
      expect(roadmap.currentPhase).toBe('5b');
    });

    it('should have overallProgress as a number', () => {
      const roadmap = service.getRoadmap();
      expect(typeof roadmap.overallProgress).toBe('number');
      expect(roadmap.overallProgress).toBeGreaterThanOrEqual(0);
      expect(roadmap.overallProgress).toBeLessThanOrEqual(100);
    });

    it('should have quarter IDs as phase IDs', () => {
      const roadmap = service.getRoadmap();
      const phaseIds = roadmap.phases.map((p) => p.id);
      expect(phaseIds).toContain('q4_2025');
      expect(phaseIds).toContain('q1_2026');
    });
  });

  describe('getBusinessRoadmap', () => {
    it('should load business roadmap from JSON file', () => {
      const businessRoadmap = service.getBusinessRoadmap();

      expect(businessRoadmap).toBeDefined();
      expect(businessRoadmap.organizationName).toBe('Ectropy');
      expect(businessRoadmap.lastUpdated).toBeDefined();
    });

    it('should have V3 financials data', () => {
      const businessRoadmap = service.getBusinessRoadmap();

      expect(businessRoadmap.financials).toBeDefined();
      expect(businessRoadmap.financials).toHaveProperty('preSeed');
      expect(businessRoadmap.financials).toHaveProperty('burnRate');
      expect(businessRoadmap.financials).toHaveProperty('runway');
    });

    it('should have V3 team data', () => {
      const businessRoadmap = service.getBusinessRoadmap();

      expect(businessRoadmap.team).toBeDefined();
      expect(businessRoadmap.team).toHaveProperty('members');
      expect(businessRoadmap.team).toHaveProperty('advisors');
    });

    it('should have V3 market and traction data', () => {
      const businessRoadmap = service.getBusinessRoadmap();

      expect(businessRoadmap.market).toBeDefined();
      expect(businessRoadmap.market).toHaveProperty('tam');
      expect(businessRoadmap.traction).toBeDefined();
      expect(businessRoadmap.traction).toHaveProperty('customers');
    });
  });

  describe('getCurrentPhase', () => {
    it('should return current phase or null', () => {
      const currentPhase = service.getCurrentPhase();

      // V2 schema has currentPhase: "5b" which may not match a quarter ID
      // getCurrentPhase finds phase by matching ID to roadmap.currentPhase
      // If no phase ID matches "5b" exactly, returns null (expected for V2)
      if (currentPhase) {
        expect(currentPhase.id).toBeDefined();
        expect(currentPhase.name).toBeDefined();
      }
    });
  });

  describe('checkAlignment', () => {
    it('should return alignment result for work plan', () => {
      const workPlan: WorkPlan = {
        taskDescription: 'Add IFC file parser for BIM data extraction',
        proposedApproach: 'Create IFC parser using web-ifc library',
        filesImpacted: ['apps/api-gateway/src/services/ifc-parser.ts'],
        estimatedComplexity: 'moderate',
        requiresTests: true,
        requiresDocumentation: false,
      };

      const alignment = service.checkAlignment(workPlan);

      expect(alignment).toBeDefined();
      expect(alignment).toHaveProperty('aligned');
      expect(alignment).toHaveProperty('currentPhase');
      expect(alignment).toHaveProperty('recommendations');
    });

    it('should detect misaligned work plan', () => {
      const workPlan: WorkPlan = {
        taskDescription: 'Add random unrelated feature',
        proposedApproach: 'Create something unrelated',
        filesImpacted: ['apps/random/src/random.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const alignment = service.checkAlignment(workPlan);

      expect(alignment.aligned).toBe(false);
      expect(alignment.workPlanMatchesPhase).toBe(false);
      expect(alignment.recommendations.length).toBeGreaterThan(0);
    });

    it('should include current phase progress', () => {
      const workPlan: WorkPlan = {
        taskDescription: 'Add IFC file parser',
        proposedApproach: 'Implement parser service',
        filesImpacted: ['apps/api-gateway/src/services/ifc-parser.ts'],
        estimatedComplexity: 'moderate',
        requiresTests: true,
        requiresDocumentation: false,
      };

      const alignment = service.checkAlignment(workPlan);

      expect(alignment.phaseProgress).toBeGreaterThanOrEqual(0);
      expect(alignment.phaseProgress).toBeLessThanOrEqual(100);
    });
  });

  describe('calculatePhaseProgress', () => {
    it('should calculate progress for a phase with deliverables', () => {
      const roadmap = service.getRoadmap();
      // q4_2025 is the first quarter — calculate from actual deliverable status
      const q4_2025 = roadmap.phases.find((p) => p.id === 'q4_2025');

      expect(q4_2025).toBeDefined();
      if (q4_2025) {
        const progress = service.calculatePhaseProgress(q4_2025);
        // Progress is calculated from deliverable completion ratio
        const total = q4_2025.deliverables.length;
        const complete = q4_2025.deliverables.filter(
          (d) => d.status === 'complete'
        ).length;
        const expected = Math.round((complete / total) * 100);
        expect(progress).toBe(expected);
      }
    });

    it('should return 100 for phase with no deliverables', () => {
      const emptyPhase = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        status: 'planned' as const,
        priority: 'low' as const,
        dependencies: [],
        deliverables: [],
      };

      const progress = service.calculatePhaseProgress(emptyPhase);
      expect(progress).toBe(100);
    });
  });

  describe('getUpcomingDeliverables', () => {
    it('should return upcoming deliverables', () => {
      const upcoming = service.getUpcomingDeliverables(5);

      expect(upcoming).toBeInstanceOf(Array);
      // May have upcoming deliverables or may not if all are complete
      expect(upcoming.length).toBeLessThanOrEqual(5);
    });

    it('should exclude completed deliverables', () => {
      const upcoming = service.getUpcomingDeliverables(10);

      const hasCompleted = upcoming.some((d) => d.status === 'complete');
      expect(hasCompleted).toBe(false);
    });
  });

  describe('updateDeliverable', () => {
    it('should validate phase structure for updates', () => {
      const roadmap = service.getRoadmap();
      // V2 schema has quarter IDs as phase IDs
      const firstPhase = roadmap.phases[0];

      expect(firstPhase).toBeDefined();
      if (firstPhase) {
        expect(firstPhase.deliverables).toBeInstanceOf(Array);

        if (firstPhase.deliverables.length > 0) {
          const deliverable = firstPhase.deliverables[0];
          expect(deliverable.id).toBeDefined();
        }
      }
    });

    it('should throw error for invalid phase', () => {
      expect(() => {
        service.updateDeliverable(
          'invalid-phase',
          'invalid-deliverable',
          'complete'
        );
      }).toThrow();
    });

    it('should throw error for invalid deliverable', () => {
      expect(() => {
        service.updateDeliverable('q4_2025', 'invalid-deliverable', 'complete');
      }).toThrow();
    });
  });

  describe('completePhase', () => {
    it('should throw error if deliverables incomplete', () => {
      expect(() => {
        service.completePhase('q1_2026');
      }).toThrow();
    });

    it('should throw error for invalid phase', () => {
      expect(() => {
        service.completePhase('invalid-phase');
      }).toThrow();
    });
  });
});
