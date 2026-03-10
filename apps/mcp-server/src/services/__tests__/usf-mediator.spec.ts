/**
 * USF Mediator Service Tests - DP-M5
 *
 * Comprehensive test suite for the USF Mediation Layer.
 * Tests all 5 decision paths and related functionality.
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import types
import type {
  EigenmodeVector,
  SDIComponents,
  DecisionTrigger,
  Engine1Output,
  Engine2Output,
  MediationDecision,
  MonitoringTrigger,
  ExplorationBudget,
  SuccessPattern,
  Action,
} from '../../types/dual-process.types.js';

import {
  DecisionTriggerType,
  SDIClassification,
  MediationSourceEngine,
  MonitoringTriggerType,
  MonitoringResponse,
  ExplorationRecommendation,
} from '../../types/dual-process.types.js';

// Services to test (will be implemented)
import {
  USFMediatorService,
  mediateDecision,
  determineDecisionPath,
  selectAction,
  createFallbackAction,
  generateRationale,
  MediationInput,
  MediationPath,
  DEFAULT_MEDIATOR_CONFIG,
} from '../usf-mediator.service.js';

import {
  ExplorationBudgetService,
  calculateExplorationBudget,
  getExplorationRecommendation,
  adjustBudgetForContext,
  DEFAULT_BUDGET_CONFIG,
} from '../exploration-budget.service.js';

import {
  MonitoringTriggerService,
  createMonitoringTrigger,
  checkTrigger,
  checkAllTriggers,
  executeTriggerResponse,
  clearTriggers,
  getActiveTriggers,
  DEFAULT_MONITORING_CONFIG,
} from '../monitoring-trigger.service.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockEigenmodeVector(): EigenmodeVector {
  return [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.1, 0.9, 0.5, 0.4, 0.6];
}

function createMockSDIComponents(overrides?: Partial<SDIComponents>): SDIComponents {
  return {
    viablePathCount: 5000,
    constraintCount: 5,
    resourceSlackRatio: 0.6,
    eigenmodeStability: 0.8,
    ...overrides,
  };
}

function createMockTrigger(overrides?: Partial<DecisionTrigger>): DecisionTrigger {
  return {
    type: DecisionTriggerType.SCHEDULED,
    source: 'urn:luhtech:test:voxel:V-001',
    urgency: 0.5,
    context: { taskId: 'T-001' },
    ...overrides,
  };
}

function createMockEngine1Output(overrides?: Partial<Engine1Output>): Engine1Output {
  return {
    applicablePatterns: [],
    patternMatchScores: [],
    confidence: 0,
    queryLatencyMs: 5,
    ...overrides,
  };
}

function createMockEngine2Output(overrides?: Partial<Engine2Output>): Engine2Output {
  return {
    viableOptions: [],
    novelOptions: [],
    sdiProjections: {},
    riskProfiles: {},
    explorationValue: {},
    computationDepth: 3,
    generationLatencyMs: 20,
    ...overrides,
  };
}

function createMockPattern(id: string, confidence: number = 0.9): SuccessPattern {
  return {
    $id: `urn:luhtech:test:success-pattern:PAT-${id}` as any,
    contextSignature: createMockEigenmodeVector(),
    actionType: 'approve',
    outcomeProfile: {
      expectedSuccessRate: 0.85,
      expectedImprovement: 1.2,
      variance: 0.1,
    },
    confidence,
    frequency: 10,
    successCount: 8,
    lastApplied: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    contextBreadth: 0.7,
    sourceDecisions: [],
    decayFactor: 1.0,
    halfLifeDays: 180,
    isGlobal: false,
    tags: [],
  };
}

function createMockAction(type: string = 'approve'): Action {
  return {
    actionType: type,
    targetUrn: 'urn:luhtech:test:target:T-001',
    parameters: {},
  };
}

// ============================================================================
// Exploration Budget Service Tests
// ============================================================================

describe('ExplorationBudgetService', () => {
  describe('calculateExplorationBudget', () => {
    it('should return zero budget in critical SDI state', () => {
      const result = calculateExplorationBudget({
        sdiValue: 50, // Below critical threshold of 100
        eigenmodeStability: 0.8,
        resourceSlackRatio: 0.9,
      });

      expect(result.budget).toBe(0);
      expect(result.recommendation).toBe(ExplorationRecommendation.EXPLOIT);
    });

    it('should return cautious budget in warning SDI state', () => {
      const result = calculateExplorationBudget({
        sdiValue: 200, // Low SDI in warning range
        eigenmodeStability: 0.2,
        resourceSlackRatio: 0.2,
      });

      expect(result.budget).toBeGreaterThan(0);
      expect(result.budget).toBeLessThan(0.3);
      expect(result.recommendation).toBe(ExplorationRecommendation.CAUTIOUS_EXPLORE);
    });

    it('should return balanced budget in healthy SDI state', () => {
      const result = calculateExplorationBudget({
        sdiValue: 10000, // Healthy SDI
        eigenmodeStability: 0.5,
        resourceSlackRatio: 0.4,
      });

      expect(result.budget).toBeGreaterThan(0.3);
      expect(result.budget).toBeLessThan(0.7);
      expect(result.recommendation).toBe(ExplorationRecommendation.BALANCED);
    });

    it('should return aggressive budget in abundant SDI state', () => {
      const result = calculateExplorationBudget({
        sdiValue: 500000, // Above abundant (100000)
        eigenmodeStability: 0.9,
        resourceSlackRatio: 0.8,
      });

      expect(result.budget).toBeGreaterThan(0.6);
      expect(result.recommendation).toBe(ExplorationRecommendation.AGGRESSIVE_EXPLORE);
    });

    it('should include breakdown factors', () => {
      const result = calculateExplorationBudget({
        sdiValue: 10000,
        eigenmodeStability: 0.7,
        resourceSlackRatio: 0.5,
      });

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.sdiFactor).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.sdiFactor).toBeLessThanOrEqual(1);
      expect(result.breakdown.stabilityFactor).toBe(0.7);
      expect(result.breakdown.resourceFactor).toBe(0.5);
    });

    it('should respect custom weights', () => {
      const defaultResult = calculateExplorationBudget({
        sdiValue: 10000,
        eigenmodeStability: 1.0,
        resourceSlackRatio: 0,
      });

      const customResult = calculateExplorationBudget({
        sdiValue: 10000,
        eigenmodeStability: 1.0,
        resourceSlackRatio: 0,
        weights: {
          sdi: 0.1,
          stability: 0.8,
          resources: 0.1,
        },
      });

      // Custom weights favor stability more
      expect(customResult.budget).toBeGreaterThan(defaultResult.budget);
    });
  });

  describe('getExplorationRecommendation', () => {
    it('should return EXPLOIT for zero budget', () => {
      const rec = getExplorationRecommendation(0);
      expect(rec).toBe(ExplorationRecommendation.EXPLOIT);
    });

    it('should return CAUTIOUS_EXPLORE for low budget', () => {
      const rec = getExplorationRecommendation(0.2);
      expect(rec).toBe(ExplorationRecommendation.CAUTIOUS_EXPLORE);
    });

    it('should return BALANCED for medium budget', () => {
      const rec = getExplorationRecommendation(0.5);
      expect(rec).toBe(ExplorationRecommendation.BALANCED);
    });

    it('should return AGGRESSIVE_EXPLORE for high budget', () => {
      const rec = getExplorationRecommendation(0.8);
      expect(rec).toBe(ExplorationRecommendation.AGGRESSIVE_EXPLORE);
    });
  });

  describe('adjustBudgetForContext', () => {
    it('should reduce budget for high urgency', () => {
      const baseBudget = 0.6;
      const adjusted = adjustBudgetForContext(baseBudget, { urgency: 0.9 });
      expect(adjusted).toBeLessThan(baseBudget);
    });

    it('should reduce budget for exception triggers', () => {
      const baseBudget = 0.6;
      const adjusted = adjustBudgetForContext(baseBudget, {
        triggerType: DecisionTriggerType.EXCEPTION,
      });
      expect(adjusted).toBeLessThan(baseBudget);
    });

    it('should increase budget for opportunity triggers', () => {
      const baseBudget = 0.4;
      const adjusted = adjustBudgetForContext(baseBudget, {
        triggerType: DecisionTriggerType.OPPORTUNITY,
      });
      expect(adjusted).toBeGreaterThan(baseBudget);
    });

    it('should cap budget at 1.0', () => {
      const adjusted = adjustBudgetForContext(0.95, {
        triggerType: DecisionTriggerType.OPPORTUNITY,
      });
      expect(adjusted).toBeLessThanOrEqual(1.0);
    });

    it('should floor budget at 0', () => {
      const adjusted = adjustBudgetForContext(0.05, {
        urgency: 1.0,
        triggerType: DecisionTriggerType.EXCEPTION,
      });
      expect(adjusted).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// Monitoring Trigger Service Tests
// ============================================================================

describe('MonitoringTriggerService', () => {
  beforeEach(() => {
    clearTriggers();
  });

  describe('createMonitoringTrigger', () => {
    it('should create a valid trigger', () => {
      const trigger = createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:test:decision-event:DEV-001',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: {
          metric: 'sdi',
          operator: '<',
          threshold: 1000,
        },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      expect(trigger.$id).toBeDefined();
      expect(trigger.$id).toContain('MON-');
      expect(trigger.isActive).toBe(true);
      expect(trigger.triggerType).toBe(MonitoringTriggerType.SDI_BREACH);
    });

    it('should enforce minimum check interval', () => {
      const trigger = createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:test:decision-event:DEV-001',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: { metric: 'sdi', operator: '<', threshold: 100 },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 100, // Too low
      });

      expect(trigger.checkIntervalMs).toBeGreaterThanOrEqual(1000);
    });

    it('should add trigger to active triggers', () => {
      createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:test:decision-event:DEV-001',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: { metric: 'sdi', operator: '<', threshold: 100 },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      const active = getActiveTriggers('urn:luhtech:test:decision-event:DEV-001');
      expect(active.length).toBe(1);
    });
  });

  describe('checkTrigger', () => {
    it('should detect SDI breach', () => {
      const trigger = createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:test:decision-event:DEV-001',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: { metric: 'sdi', operator: '<', threshold: 1000 },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      const result = checkTrigger(trigger, { sdi: 500 });
      expect(result.triggered).toBe(true);
      expect(result.currentValue).toBe(500);
    });

    it('should not trigger when condition not met', () => {
      const trigger = createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:test:decision-event:DEV-001',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: { metric: 'sdi', operator: '<', threshold: 1000 },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      const result = checkTrigger(trigger, { sdi: 5000 });
      expect(result.triggered).toBe(false);
    });

    it('should handle all comparison operators', () => {
      const operators: Array<'<' | '>' | '<=' | '>=' | '==' | '!='> = [
        '<', '>', '<=', '>=', '==', '!=',
      ];

      for (const op of operators) {
        const trigger = createMonitoringTrigger({
          decisionEventUrn: `urn:luhtech:test:decision-event:DEV-${op}`,
          triggerType: MonitoringTriggerType.SDI_BREACH,
          condition: { metric: 'sdi', operator: op, threshold: 100 },
          response: MonitoringResponse.FALLBACK,
          checkIntervalMs: 60000,
        });

        const result = checkTrigger(trigger, { sdi: 100 });
        // At least verify it doesn't throw
        expect(typeof result.triggered).toBe('boolean');
      }
    });

    it('should skip inactive triggers', () => {
      const trigger = createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:test:decision-event:DEV-001',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: { metric: 'sdi', operator: '<', threshold: 1000 },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      trigger.isActive = false;

      const result = checkTrigger(trigger, { sdi: 500 });
      expect(result.triggered).toBe(false);
      expect(result.skipped).toBe(true);
    });
  });

  describe('checkAllTriggers', () => {
    it('should check all triggers for a project', () => {
      createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:proj1:decision-event:DEV-001',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: { metric: 'sdi', operator: '<', threshold: 1000 },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:proj1:decision-event:DEV-002',
        triggerType: MonitoringTriggerType.TIMELINE_DEVIATION,
        condition: { metric: 'daysLate', operator: '>', threshold: 5 },
        response: MonitoringResponse.ESCALATE,
        checkIntervalMs: 60000,
      });

      const results = checkAllTriggers('proj1', {
        sdi: 500,
        daysLate: 3,
      });

      expect(results.triggersChecked).toBe(2);
      expect(results.triggersActivated.length).toBe(1); // Only SDI breach
    });

    it('should filter by specific decision event', () => {
      createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:proj1:decision-event:DEV-001',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: { metric: 'sdi', operator: '<', threshold: 1000 },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:proj1:decision-event:DEV-002',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: { metric: 'sdi', operator: '<', threshold: 1000 },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      const results = checkAllTriggers('proj1', { sdi: 500 }, {
        decisionEventUrn: 'urn:luhtech:proj1:decision-event:DEV-001',
      });

      expect(results.triggersChecked).toBe(1);
    });
  });

  describe('executeTriggerResponse', () => {
    it('should mark trigger as triggered', () => {
      const trigger = createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:test:decision-event:DEV-001',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: { metric: 'sdi', operator: '<', threshold: 1000 },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      const result = executeTriggerResponse(trigger, { sdi: 500 });

      expect(result.executed).toBe(true);
      expect(result.response).toBe(MonitoringResponse.FALLBACK);
      expect(trigger.triggeredAt).toBeDefined();
    });

    it('should return appropriate action for each response type', () => {
      const responses = [
        MonitoringResponse.FALLBACK,
        MonitoringResponse.ESCALATE,
        MonitoringResponse.CONSTRAIN,
        MonitoringResponse.RE_MEDIATE,
      ];

      for (const response of responses) {
        const trigger = createMonitoringTrigger({
          decisionEventUrn: `urn:luhtech:test:decision-event:DEV-${response}`,
          triggerType: MonitoringTriggerType.SDI_BREACH,
          condition: { metric: 'sdi', operator: '<', threshold: 1000 },
          response,
          checkIntervalMs: 60000,
        });

        const result = executeTriggerResponse(trigger, { sdi: 500 });
        expect(result.executed).toBe(true);
        expect(result.action).toBeDefined();
      }
    });
  });
});

// ============================================================================
// USF Mediator Service Tests
// ============================================================================

describe('USFMediatorService', () => {
  describe('determineDecisionPath', () => {
    it('should select CRISIS_MODE when SDI < critical threshold', () => {
      const path = determineDecisionPath({
        sdiValue: 50, // Below 100
        sdiClassification: SDIClassification.CRITICAL,
        engine1Confidence: 0.9,
        engine2BestOption: null,
        explorationBudget: 0,
        hasApplicablePatterns: true,
      });

      expect(path).toBe(MediationPath.CRISIS_MODE);
    });

    it('should select HIGH_CONFIDENCE_MATCH when Engine 1 confidence > 0.9', () => {
      const path = determineDecisionPath({
        sdiValue: 5000,
        sdiClassification: SDIClassification.WARNING,
        engine1Confidence: 0.95,
        engine2BestOption: null,
        explorationBudget: 0.3,
        hasApplicablePatterns: true,
      });

      expect(path).toBe(MediationPath.HIGH_CONFIDENCE_MATCH);
    });

    it('should select PROMISING_EXPLORATION when Engine 2 is significantly better', () => {
      const path = determineDecisionPath({
        sdiValue: 50000,
        sdiClassification: SDIClassification.HEALTHY,
        engine1Confidence: 0.6,
        engine2BestOption: {
          projectedSdi: 80000, // 60% better than current
          explorationValue: 0.8,
          feasibilityScore: 0.9,
        },
        explorationBudget: 0.6,
        hasApplicablePatterns: true,
      });

      expect(path).toBe(MediationPath.PROMISING_EXPLORATION);
    });

    it('should select NO_PATTERNS when no applicable patterns exist', () => {
      const path = determineDecisionPath({
        sdiValue: 10000,
        sdiClassification: SDIClassification.HEALTHY,
        engine1Confidence: 0,
        engine2BestOption: null,
        explorationBudget: 0.5,
        hasApplicablePatterns: false,
      });

      expect(path).toBe(MediationPath.NO_PATTERNS);
    });

    it('should select DEFAULT_BLEND as fallback', () => {
      const path = determineDecisionPath({
        sdiValue: 10000,
        sdiClassification: SDIClassification.HEALTHY,
        engine1Confidence: 0.7, // Good but not > 0.9
        engine2BestOption: {
          projectedSdi: 12000, // Only 20% better
          explorationValue: 0.3,
          feasibilityScore: 0.7,
        },
        explorationBudget: 0.4,
        hasApplicablePatterns: true,
      });

      expect(path).toBe(MediationPath.DEFAULT_BLEND);
    });
  });

  describe('selectAction', () => {
    it('should select Engine 1 action in CRISIS_MODE', () => {
      const engine1Output = createMockEngine1Output({
        applicablePatterns: [createMockPattern('001')],
        patternMatchScores: [0.9],
        confidence: 0.9,
        recommendedAction: createMockAction('approve'),
      });

      const result = selectAction(
        MediationPath.CRISIS_MODE,
        engine1Output,
        createMockEngine2Output(),
        0
      );

      expect(result.action.actionType).toBe('approve');
      expect(result.source).toBe(MediationSourceEngine.ENGINE_1);
      expect(result.explorationAllocation).toBe(0);
    });

    it('should select Engine 1 with minimal exploration in HIGH_CONFIDENCE_MATCH', () => {
      const engine1Output = createMockEngine1Output({
        applicablePatterns: [createMockPattern('001', 0.95)],
        patternMatchScores: [0.95],
        confidence: 0.95,
        recommendedAction: createMockAction('approve'),
      });

      const result = selectAction(
        MediationPath.HIGH_CONFIDENCE_MATCH,
        engine1Output,
        createMockEngine2Output(),
        0.5
      );

      expect(result.source).toBe(MediationSourceEngine.ENGINE_1);
      expect(result.explorationAllocation).toBe(0.1); // Minimal exploration
    });

    it('should select Engine 2 with fallback in PROMISING_EXPLORATION', () => {
      const engine1Output = createMockEngine1Output({
        applicablePatterns: [createMockPattern('001', 0.6)],
        patternMatchScores: [0.85],
        confidence: 0.6,
        recommendedAction: createMockAction('defer'),
      });

      const engine2Output = createMockEngine2Output({
        viableOptions: [{
          id: 'OPT-001',
          action: createMockAction('add_resource'),
          isNovel: true,
          projectedSdi: 80000,
          sdiDelta: 30000,
          riskLevel: 'medium',
          constraintViolations: [],
          feasibilityScore: 0.9,
          explorationValue: 0.8,
        }],
      });

      const result = selectAction(
        MediationPath.PROMISING_EXPLORATION,
        engine1Output,
        engine2Output,
        0.6
      );

      expect(result.source).toBe(MediationSourceEngine.ENGINE_2);
      expect(result.action.actionType).toBe('add_resource');
      expect(result.fallbackAction).toBeDefined();
      expect(result.fallbackAction?.actionType).toBe('defer');
    });

    it('should escalate or use lowest-risk in NO_PATTERNS', () => {
      const engine1Output = createMockEngine1Output();

      const engine2Output = createMockEngine2Output({
        viableOptions: [
          {
            id: 'OPT-001',
            action: createMockAction('escalate'),
            isNovel: false,
            projectedSdi: 10000,
            sdiDelta: 0,
            riskLevel: 'low',
            constraintViolations: [],
            feasibilityScore: 1.0,
            explorationValue: 0,
          },
        ],
      });

      const result = selectAction(
        MediationPath.NO_PATTERNS,
        engine1Output,
        engine2Output,
        0.5
      );

      // Should escalate or select lowest risk option
      expect(['escalate', 'defer']).toContain(result.action.actionType);
    });

    it('should blend engines in DEFAULT_BLEND', () => {
      const engine1Output = createMockEngine1Output({
        applicablePatterns: [createMockPattern('001', 0.7)],
        patternMatchScores: [0.85],
        confidence: 0.7,
        recommendedAction: createMockAction('approve'),
      });

      const engine2Output = createMockEngine2Output({
        viableOptions: [{
          id: 'OPT-001',
          action: createMockAction('add_resource'),
          isNovel: true,
          projectedSdi: 15000,
          sdiDelta: 5000,
          riskLevel: 'low',
          constraintViolations: [],
          feasibilityScore: 0.8,
          explorationValue: 0.5,
        }],
      });

      const result = selectAction(
        MediationPath.DEFAULT_BLEND,
        engine1Output,
        engine2Output,
        0.5
      );

      expect(result.source).toBe(MediationSourceEngine.BLEND);
      // Exploration allocation should be influenced by budget
      expect(result.explorationAllocation).toBeGreaterThan(0);
      expect(result.explorationAllocation).toBeLessThanOrEqual(0.5);
    });
  });

  describe('createFallbackAction', () => {
    it('should create fallback from Engine 1 when available', () => {
      const engine1Output = createMockEngine1Output({
        recommendedAction: createMockAction('approve'),
      });

      const fallback = createFallbackAction(engine1Output, createMockEngine2Output());
      expect(fallback?.actionType).toBe('approve');
    });

    it('should create fallback from lowest-risk Engine 2 option', () => {
      const engine1Output = createMockEngine1Output();
      const engine2Output = createMockEngine2Output({
        viableOptions: [
          {
            id: 'OPT-001',
            action: createMockAction('risky'),
            isNovel: true,
            projectedSdi: 50000,
            sdiDelta: 40000,
            riskLevel: 'high',
            constraintViolations: [],
            feasibilityScore: 0.5,
            explorationValue: 0.9,
          },
          {
            id: 'OPT-002',
            action: createMockAction('safe'),
            isNovel: false,
            projectedSdi: 12000,
            sdiDelta: 2000,
            riskLevel: 'low',
            constraintViolations: [],
            feasibilityScore: 0.95,
            explorationValue: 0.2,
          },
        ],
      });

      const fallback = createFallbackAction(engine1Output, engine2Output);
      expect(fallback?.actionType).toBe('safe');
    });

    it('should return default defer action when no options available', () => {
      const fallback = createFallbackAction(
        createMockEngine1Output(),
        createMockEngine2Output()
      );

      expect(fallback?.actionType).toBe('defer');
    });
  });

  describe('generateRationale', () => {
    it('should generate rationale for CRISIS_MODE', () => {
      const rationale = generateRationale(
        MediationPath.CRISIS_MODE,
        MediationSourceEngine.ENGINE_1,
        { sdiValue: 50, confidence: 0.9 }
      );

      expect(rationale).toContain('Crisis');
      expect(rationale.toLowerCase()).toContain('pattern');
    });

    it('should generate rationale for HIGH_CONFIDENCE_MATCH', () => {
      const rationale = generateRationale(
        MediationPath.HIGH_CONFIDENCE_MATCH,
        MediationSourceEngine.ENGINE_1,
        { sdiValue: 5000, confidence: 0.95 }
      );

      expect(rationale).toContain('confidence');
    });

    it('should generate rationale for PROMISING_EXPLORATION', () => {
      const rationale = generateRationale(
        MediationPath.PROMISING_EXPLORATION,
        MediationSourceEngine.ENGINE_2,
        { sdiValue: 50000, projectedImprovement: 0.6 }
      );

      expect(rationale.toLowerCase()).toContain('explor');
    });

    it('should generate rationale for NO_PATTERNS', () => {
      const rationale = generateRationale(
        MediationPath.NO_PATTERNS,
        MediationSourceEngine.ESCALATE,
        { sdiValue: 10000 }
      );

      expect(rationale.toLowerCase()).toContain('no');
      expect(rationale.toLowerCase()).toMatch(/pattern|precedent/);
    });

    it('should generate rationale for DEFAULT_BLEND', () => {
      const rationale = generateRationale(
        MediationPath.DEFAULT_BLEND,
        MediationSourceEngine.BLEND,
        { sdiValue: 10000, explorationAllocation: 0.4 }
      );

      expect(rationale.toLowerCase()).toContain('blend');
    });
  });

  describe('mediateDecision (integration)', () => {
    it('should perform full mediation in CRISIS_MODE', async () => {
      const input: MediationInput = {
        projectId: 'proj-001',
        zoneId: 'zone-001',
        trigger: createMockTrigger(),
        actorId: 'user-001',
        components: createMockSDIComponents({
          viablePathCount: 10,
          constraintCount: 50,
          resourceSlackRatio: 0.1,
          eigenmodeStability: 0.2,
        }),
        eigenmodeContext: createMockEigenmodeVector(),
        engine1Output: createMockEngine1Output({
          applicablePatterns: [createMockPattern('001')],
          patternMatchScores: [0.9],
          confidence: 0.9,
          recommendedAction: createMockAction('approve'),
        }),
        engine2Output: createMockEngine2Output(),
      };

      const result = await mediateDecision(input);

      expect(result.decisionEventUrn).toContain('DEV-');
      expect(result.sourceEngine).toBe(MediationSourceEngine.ENGINE_1);
      expect(result.explorationAllocation).toBe(0);
      expect(result.rationale).toBeDefined();
      expect(result.mediationLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should perform full mediation with monitoring triggers for exploratory decisions', async () => {
      const input: MediationInput = {
        projectId: 'proj-001',
        zoneId: 'zone-001',
        trigger: createMockTrigger({ type: DecisionTriggerType.OPPORTUNITY }),
        actorId: 'user-001',
        components: createMockSDIComponents({
          viablePathCount: 100000,
          constraintCount: 3,
          resourceSlackRatio: 0.8,
          eigenmodeStability: 0.9,
        }),
        eigenmodeContext: createMockEigenmodeVector(),
        engine1Output: createMockEngine1Output({
          applicablePatterns: [createMockPattern('001', 0.6)],
          patternMatchScores: [0.85],
          confidence: 0.6,
          recommendedAction: createMockAction('approve'),
        }),
        engine2Output: createMockEngine2Output({
          viableOptions: [{
            id: 'OPT-001',
            action: createMockAction('add_resource'),
            isNovel: true,
            projectedSdi: 200000,
            sdiDelta: 100000,
            riskLevel: 'medium',
            constraintViolations: [],
            feasibilityScore: 0.85,
            explorationValue: 0.9,
          }],
        }),
      };

      const result = await mediateDecision(input);

      expect(result.sourceEngine).toBe(MediationSourceEngine.ENGINE_2);
      expect(result.monitoringTriggers.length).toBeGreaterThan(0);
      expect(result.fallbackAction).toBeDefined();
    });

    it('should respect dryRun flag', async () => {
      const input: MediationInput = {
        projectId: 'proj-001',
        trigger: createMockTrigger(),
        actorId: 'user-001',
        components: createMockSDIComponents(),
        eigenmodeContext: createMockEigenmodeVector(),
        engine1Output: createMockEngine1Output({
          applicablePatterns: [createMockPattern('001')],
          patternMatchScores: [0.9],
          confidence: 0.9,
          recommendedAction: createMockAction('approve'),
        }),
        engine2Output: createMockEngine2Output(),
        dryRun: true,
      };

      const result = await mediateDecision(input);

      expect(result.decisionEventUrn).toContain('DRY-');
    });

    it('should respect forceEngine flag', async () => {
      const input: MediationInput = {
        projectId: 'proj-001',
        trigger: createMockTrigger(),
        actorId: 'user-001',
        components: createMockSDIComponents(),
        eigenmodeContext: createMockEigenmodeVector(),
        engine1Output: createMockEngine1Output({
          applicablePatterns: [createMockPattern('001')],
          patternMatchScores: [0.9],
          confidence: 0.9,
          recommendedAction: createMockAction('from_engine1'),
        }),
        engine2Output: createMockEngine2Output({
          viableOptions: [{
            id: 'OPT-001',
            action: createMockAction('from_engine2'),
            isNovel: true,
            projectedSdi: 50000,
            sdiDelta: 40000,
            riskLevel: 'low',
            constraintViolations: [],
            feasibilityScore: 0.9,
            explorationValue: 0.5,
          }],
        }),
        forceEngine: 'engine2',
      };

      const result = await mediateDecision(input);

      expect(result.selectedAction.actionType).toBe('from_engine2');
      expect(result.sourceEngine).toBe(MediationSourceEngine.ENGINE_2);
    });

    it('should escalate when no viable options in NO_PATTERNS path', async () => {
      const input: MediationInput = {
        projectId: 'proj-001',
        trigger: createMockTrigger(),
        actorId: 'user-001',
        components: createMockSDIComponents(),
        eigenmodeContext: createMockEigenmodeVector(),
        engine1Output: createMockEngine1Output(), // No patterns
        engine2Output: createMockEngine2Output(), // No options
      };

      const result = await mediateDecision(input);

      expect(result.sourceEngine).toBe(MediationSourceEngine.ESCALATE);
      expect(result.escalationTarget).toBeDefined();
    });

    it('should include both engine outputs in result', async () => {
      const engine1 = createMockEngine1Output({
        applicablePatterns: [createMockPattern('001')],
        confidence: 0.8,
      });
      const engine2 = createMockEngine2Output({
        viableOptions: [{
          id: 'OPT-001',
          action: createMockAction('test'),
          isNovel: false,
          projectedSdi: 10000,
          sdiDelta: 0,
          riskLevel: 'low',
          constraintViolations: [],
          feasibilityScore: 0.9,
          explorationValue: 0.3,
        }],
      });

      const input: MediationInput = {
        projectId: 'proj-001',
        trigger: createMockTrigger(),
        actorId: 'user-001',
        components: createMockSDIComponents(),
        eigenmodeContext: createMockEigenmodeVector(),
        engine1Output: engine1,
        engine2Output: engine2,
      };

      const result = await mediateDecision(input);

      expect(result.engine1Output).toBeDefined();
      expect(result.engine2Output).toBeDefined();
    });

    it('should calculate risk bearer correctly', async () => {
      const input: MediationInput = {
        projectId: 'proj-001',
        trigger: createMockTrigger(),
        actorId: 'user-001',
        components: createMockSDIComponents({
          viablePathCount: 200000,
          constraintCount: 2,
          resourceSlackRatio: 0.9,
          eigenmodeStability: 0.95,
        }),
        eigenmodeContext: createMockEigenmodeVector(),
        engine1Output: createMockEngine1Output({
          applicablePatterns: [createMockPattern('001', 0.5)],
          patternMatchScores: [0.8],
          confidence: 0.5,
        }),
        engine2Output: createMockEngine2Output({
          viableOptions: [{
            id: 'OPT-001',
            action: createMockAction('novel'),
            isNovel: true,
            projectedSdi: 500000,
            sdiDelta: 300000,
            riskLevel: 'medium',
            constraintViolations: [],
            feasibilityScore: 0.8,
            explorationValue: 0.95,
          }],
        }),
      };

      const result = await mediateDecision(input);

      expect(result.riskBearer).toBeDefined();
      // For exploratory decisions, risk bearer should be the actor
      if (result.sourceEngine === MediationSourceEngine.ENGINE_2) {
        expect(result.riskBearer).toBe('user-001');
      }
    });
  });

  describe('configuration', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_MEDIATOR_CONFIG.crisisThreshold).toBe(100);
      expect(DEFAULT_MEDIATOR_CONFIG.highConfidenceThreshold).toBe(0.9);
      expect(DEFAULT_MEDIATOR_CONFIG.significantImprovementThreshold).toBe(0.3);
      expect(DEFAULT_MEDIATOR_CONFIG.minimalExploration).toBe(0.1);
    });
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases', () => {
  describe('ExplorationBudgetService edge cases', () => {
    it('should handle zero SDI', () => {
      const result = calculateExplorationBudget({
        sdiValue: 0,
        eigenmodeStability: 0.5,
        resourceSlackRatio: 0.5,
      });

      expect(result.budget).toBe(0);
    });

    it('should handle negative SDI gracefully', () => {
      const result = calculateExplorationBudget({
        sdiValue: -100,
        eigenmodeStability: 0.5,
        resourceSlackRatio: 0.5,
      });

      expect(result.budget).toBe(0);
    });

    it('should clamp stability and resource ratios', () => {
      const result = calculateExplorationBudget({
        sdiValue: 10000,
        eigenmodeStability: 1.5, // Over 1
        resourceSlackRatio: -0.5, // Under 0
      });

      expect(result.breakdown.stabilityFactor).toBeLessThanOrEqual(1);
      expect(result.breakdown.resourceFactor).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MonitoringTriggerService edge cases', () => {
    beforeEach(() => {
      clearTriggers();
    });

    it('should handle missing metric in check', () => {
      const trigger = createMonitoringTrigger({
        decisionEventUrn: 'urn:luhtech:test:decision-event:DEV-001',
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: { metric: 'nonexistent', operator: '<', threshold: 1000 },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      const result = checkTrigger(trigger, { sdi: 500 }); // Missing 'nonexistent'
      expect(result.triggered).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty project in checkAllTriggers', () => {
      const results = checkAllTriggers('empty-project', { sdi: 500 });
      expect(results.triggersChecked).toBe(0);
      expect(results.triggersActivated.length).toBe(0);
    });
  });

  describe('USFMediatorService edge cases', () => {
    it('should handle empty Engine 1 patterns', () => {
      const path = determineDecisionPath({
        sdiValue: 10000,
        sdiClassification: SDIClassification.HEALTHY,
        engine1Confidence: 0,
        engine2BestOption: null,
        explorationBudget: 0.5,
        hasApplicablePatterns: false,
      });

      expect(path).toBe(MediationPath.NO_PATTERNS);
    });

    it('should handle empty Engine 2 options', () => {
      const engine2Output = createMockEngine2Output();

      const result = selectAction(
        MediationPath.PROMISING_EXPLORATION,
        createMockEngine1Output({
          recommendedAction: createMockAction('fallback'),
        }),
        engine2Output,
        0.6
      );

      // Should fall back to Engine 1
      expect(result.action.actionType).toBe('fallback');
    });

    it('should handle both engines having no recommendations', () => {
      const result = selectAction(
        MediationPath.DEFAULT_BLEND,
        createMockEngine1Output(),
        createMockEngine2Output(),
        0.5
      );

      // Should provide a safe default
      expect(result.action).toBeDefined();
      expect(['defer', 'escalate']).toContain(result.action.actionType);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance', () => {
  it('should complete mediation in under 100ms', async () => {
    const input: MediationInput = {
      projectId: 'proj-001',
      trigger: createMockTrigger(),
      actorId: 'user-001',
      components: createMockSDIComponents(),
      eigenmodeContext: createMockEigenmodeVector(),
      engine1Output: createMockEngine1Output({
        applicablePatterns: [createMockPattern('001')],
        patternMatchScores: [0.9],
        confidence: 0.9,
        recommendedAction: createMockAction('approve'),
      }),
      engine2Output: createMockEngine2Output(),
    };

    const start = performance.now();
    await mediateDecision(input);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it('should handle concurrent mediations', async () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      projectId: `proj-${i}`,
      trigger: createMockTrigger(),
      actorId: `user-${i}`,
      components: createMockSDIComponents(),
      eigenmodeContext: createMockEigenmodeVector(),
      engine1Output: createMockEngine1Output({
        applicablePatterns: [createMockPattern(`${i}`)],
        patternMatchScores: [0.9],
        confidence: 0.9,
        recommendedAction: createMockAction('approve'),
      }),
      engine2Output: createMockEngine2Output(),
    }));

    const start = performance.now();
    const results = await Promise.all(inputs.map(mediateDecision));
    const elapsed = performance.now() - start;

    expect(results.length).toBe(10);
    expect(elapsed).toBeLessThan(500); // All 10 under 500ms
  });
});
