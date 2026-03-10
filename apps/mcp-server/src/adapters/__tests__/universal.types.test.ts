/**
 * Universal Types Validation Tests
 *
 * Validates that universal types correctly model domain-agnostic concepts.
 * These tests verify type contracts, not runtime behavior — ensuring
 * that universal types can represent data from any domain.
 *
 * @module adapters/__tests__
 */

import { describe, it, expect } from 'vitest';
import type {
  DomainContext,
  IWorkUnit,
  IDecision,
  IDecisionAlternative,
  IDependency,
  IStateNode,
  IContainer,
  IMilestone,
  IAuthorityLevel,
  IAuthorityCascade,
  IHealthMetric,
  IHealthAssessment,
  IWorkRecommendation,
  UniversalStatus,
  ImpactLevel,
} from '../universal/universal.types.js';

describe('Universal Types', () => {
  const testDomain: DomainContext = {
    domainId: 'test',
    domainName: 'Test Domain',
    domainVersion: '1.0.0',
  };

  describe('DomainContext', () => {
    it('should represent a domain identity', () => {
      expect(testDomain.domainId).toBe('test');
      expect(testDomain.domainName).toBe('Test Domain');
      expect(testDomain.domainVersion).toBe('1.0.0');
    });
  });

  describe('IWorkUnit', () => {
    it('should model a generic work unit', () => {
      const workUnit: IWorkUnit = {
        id: 'wu-001',
        domain: testDomain,
        title: 'Implement feature X',
        status: 'active',
        progress: 0.75,
        owner: 'developer-1',
        containerId: 'sprint-1',
        dependencyIds: ['wu-000'],
        blockingIds: ['wu-002'],
        metadata: { storyPoints: 5 },
        createdAt: '2026-02-25T00:00:00Z',
        updatedAt: '2026-02-25T12:00:00Z',
        targetDate: '2026-03-01',
      };

      expect(workUnit.id).toBe('wu-001');
      expect(workUnit.status).toBe('active');
      expect(workUnit.progress).toBe(0.75);
      expect(workUnit.dependencyIds).toHaveLength(1);
      expect(workUnit.blockingIds).toHaveLength(1);
    });

    it('should allow optional fields to be undefined', () => {
      const minimal: IWorkUnit = {
        id: 'wu-002',
        domain: testDomain,
        title: 'Minimal work unit',
        status: 'planned',
        progress: 0,
        dependencyIds: [],
        blockingIds: [],
        metadata: {},
        createdAt: '2026-02-25T00:00:00Z',
        updatedAt: '2026-02-25T00:00:00Z',
      };

      expect(minimal.owner).toBeUndefined();
      expect(minimal.containerId).toBeUndefined();
      expect(minimal.targetDate).toBeUndefined();
      expect(minimal.description).toBeUndefined();
      expect(minimal.urn).toBeUndefined();
      expect(minimal.graphMetadata).toBeUndefined();
    });
  });

  describe('IDecision', () => {
    it('should model a decision with alternatives', () => {
      const alternatives: IDecisionAlternative[] = [
        {
          title: 'Option A',
          description: 'Use framework X',
          pros: ['Well documented', 'Large community'],
          cons: ['Heavy', 'Learning curve'],
          selected: true,
        },
        {
          title: 'Option B',
          description: 'Build from scratch',
          pros: ['Full control'],
          cons: ['Time consuming', 'Maintenance burden'],
          selected: false,
          rejectionReason: 'Too much effort for timeline',
        },
      ];

      const decision: IDecision = {
        id: 'd-001',
        domain: testDomain,
        title: 'Framework Selection',
        context: 'Need to choose a web framework',
        resolution: 'Selected framework X',
        rationale: 'Best balance of features and community',
        status: 'completed',
        impact: 'high',
        proposedBy: 'architect',
        approvedBy: 'erik',
        alternatives,
        relatedDecisionIds: [],
        impactedWorkUnitIds: ['wu-001', 'wu-002'],
        evidence: ['evidence/2026-02/framework-analysis.json'],
        tags: ['architecture', 'framework'],
        category: 'technical',
        createdAt: '2026-02-25T00:00:00Z',
        updatedAt: '2026-02-25T12:00:00Z',
      };

      expect(decision.alternatives).toHaveLength(2);
      expect(decision.alternatives[0].selected).toBe(true);
      expect(decision.alternatives[1].rejectionReason).toBeDefined();
      expect(decision.impactedWorkUnitIds).toHaveLength(2);
    });
  });

  describe('IDependency', () => {
    it('should model a dependency relationship', () => {
      const dependency: IDependency = {
        id: 'dep-001',
        domain: testDomain,
        sourceId: 'wu-001',
        targetId: 'wu-000',
        type: 'depends-on',
        isCritical: true,
        status: 'pending',
        description: 'Feature X requires Feature Y foundation',
        metadata: { estimatedDelay: '2 days' },
      };

      expect(dependency.type).toBe('depends-on');
      expect(dependency.isCritical).toBe(true);
      expect(dependency.status).toBe('pending');
    });
  });

  describe('IStateNode', () => {
    it('should model a state graph node with relationships', () => {
      const node: IStateNode = {
        id: 'node-001',
        domain: testDomain,
        title: 'Feature X Implementation',
        nodeType: 'feature',
        status: 'active',
        phase: 'phase-5b',
        content: {
          approach: 'Incremental implementation',
          outcome: 'In progress',
        },
        metadata: {
          category: 'feature',
          tags: ['frontend', 'ux'],
        },
        relationships: {
          dependencies: ['node-000'],
          triggers: ['node-002'],
          relatedNodes: ['node-003'],
          evidence: ['evidence/2026-02/feature-x.json'],
        },
        createdAt: '2026-02-25T00:00:00Z',
        updatedAt: '2026-02-25T12:00:00Z',
      };

      expect(node.nodeType).toBe('feature');
      expect(node.phase).toBe('phase-5b');
      expect(node.relationships.dependencies).toHaveLength(1);
      expect(node.relationships.triggers).toHaveLength(1);
    });
  });

  describe('IContainer', () => {
    it('should model a container with milestones', () => {
      const milestone: IMilestone = {
        id: 'ms-001',
        name: 'Pilot Launch',
        targetDate: '2026-03-01',
        isGate: true,
        isCritical: true,
        status: 'planned',
        metadata: { type: 'launch' },
      };

      const container: IContainer = {
        id: 'q1-2026',
        domain: testDomain,
        name: 'Q1 2026',
        description: 'Pilot preparation',
        status: 'active',
        workUnitIds: ['wu-001', 'wu-002', 'wu-003'],
        milestones: [milestone],
        metadata: {},
      };

      expect(container.workUnitIds).toHaveLength(3);
      expect(container.milestones).toHaveLength(1);
      expect(container.milestones[0].isGate).toBe(true);
    });
  });

  describe('IAuthorityLevel', () => {
    it('should model an authority tier', () => {
      const level: IAuthorityLevel = {
        tier: 1,
        id: 'developer',
        title: 'Developer',
        budgetLimit: 0,
        timeAuthorityHours: 40,
        scopeDescription: 'Single feature',
        canAutoApprove: false,
        permissions: ['READ_STATE', 'CREATE_PR'],
      };

      expect(level.tier).toBe(1);
      expect(level.canAutoApprove).toBe(false);
      expect(level.permissions).toContain('CREATE_PR');
    });
  });

  describe('IHealthMetric', () => {
    it('should model a health metric with trend', () => {
      const metric: IHealthMetric = {
        id: 'test_coverage',
        name: 'Test Coverage',
        value: 0.85,
        previousValue: 0.8,
        trend: 'improving',
        weight: 0.1,
        healthyThreshold: 0.8,
        warningThreshold: 0.6,
        measuredAt: '2026-02-25T12:00:00Z',
        source: 'test-eigenmodes',
      };

      expect(metric.value).toBe(0.85);
      expect(metric.trend).toBe('improving');
      expect(metric.value).toBeGreaterThan(metric.healthyThreshold);
    });
  });

  describe('UniversalStatus', () => {
    it('should cover all lifecycle states', () => {
      const statuses: UniversalStatus[] = [
        'planned',
        'active',
        'completed',
        'blocked',
        'on-hold',
        'cancelled',
        'failed',
      ];

      expect(statuses).toHaveLength(7);
      expect(new Set(statuses).size).toBe(7); // All unique
    });
  });

  describe('ImpactLevel', () => {
    it('should cover severity levels', () => {
      const levels: ImpactLevel[] = ['low', 'medium', 'high', 'critical'];
      expect(levels).toHaveLength(4);
    });
  });

  describe('IWorkRecommendation', () => {
    it('should model a prioritized recommendation', () => {
      const recommendation: IWorkRecommendation = {
        workUnit: {
          id: 'wu-001',
          domain: testDomain,
          title: 'High priority work',
          status: 'active',
          progress: 0.8,
          dependencyIds: [],
          blockingIds: [],
          metadata: {},
          createdAt: '2026-02-25T00:00:00Z',
          updatedAt: '2026-02-25T00:00:00Z',
        },
        priority: 0.92,
        rationale: '80% complete, no blockers, health concerns in CI stability',
        blockers: [],
        relatedDecisions: [],
        relevantMetrics: [],
      };

      expect(recommendation.priority).toBeGreaterThan(0.9);
      expect(recommendation.blockers).toHaveLength(0);
    });
  });
});
