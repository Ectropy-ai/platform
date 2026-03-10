/**
 * Dual-Process Decision Architecture Integration Tests - DP-M7
 *
 * End-to-end integration tests for the complete dual-process system.
 * Tests the full flow from trigger to outcome recording.
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import all services
import {
  calculateSDI,
  computeSDIFromComponents,
  classifySDI,
  computeExplorationBudget as computeSDIExplorationBudget,
} from '../sdi-calculator.service.js';

import {
  querySuccessStack,
  storePattern,
  clearPatternStore,
  getStoreStatistics,
} from '../success-stack.service.js';

import {
  generateOptions,
  findBestOption,
  filterByRiskLevel,
} from '../possibility-space.service.js';

import {
  mediateDecision,
  determineDecisionPath,
  MediationPath,
  resetMediationIdCounter,
} from '../usf-mediator.service.js';

import {
  calculateExplorationBudget,
  adjustBudgetForContext,
} from '../exploration-budget.service.js';

import {
  createMonitoringTrigger,
  checkAllTriggers,
  clearTriggers,
} from '../monitoring-trigger.service.js';

import {
  registerEventListener,
  clearAllListeners,
  clearEventHistory,
  getEventHistory,
} from '../decision-event-handler.service.js';

import {
  storeDecisionRecord,
  recordDecisionOutcome,
  getLearningStatistics,
  clearDecisionRecords,
} from '../pattern-learning.service.js';

import type {
  EigenmodeVector,
  SDIComponents,
  DecisionTrigger,
  SuccessPattern,
} from '../../types/dual-process.types.js';

import {
  DecisionTriggerType,
  SDIClassification,
  MediationSourceEngine,
  MonitoringTriggerType,
  MonitoringResponse,
  DUAL_PROCESS_EVENT_TYPES,
} from '../../types/dual-process.types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockEigenmodeVector(seed: number = 0.5): EigenmodeVector {
  return [
    seed, seed - 0.2, seed + 0.2, seed - 0.1,
    seed + 0.1, seed - 0.3, seed + 0.3, seed - 0.4,
    seed + 0.4, seed, seed - 0.1, seed + 0.1,
  ];
}

function createMockSDIComponents(sdiLevel: 'critical' | 'warning' | 'healthy' | 'abundant'): SDIComponents {
  switch (sdiLevel) {
    case 'critical':
      return {
        viablePathCount: 10,
        constraintCount: 50,
        resourceSlackRatio: 0.1,
        eigenmodeStability: 0.2,
      };
    case 'warning':
      return {
        viablePathCount: 100,
        constraintCount: 20,
        resourceSlackRatio: 0.3,
        eigenmodeStability: 0.4,
      };
    case 'healthy':
      return {
        viablePathCount: 1000,
        constraintCount: 10,
        resourceSlackRatio: 0.6,
        eigenmodeStability: 0.7,
      };
    case 'abundant':
      return {
        viablePathCount: 10000,
        constraintCount: 3,
        resourceSlackRatio: 0.9,
        eigenmodeStability: 0.95,
      };
  }
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

// ============================================================================
// Integration Tests
// ============================================================================

describe('Dual-Process Integration', () => {
  beforeEach(() => {
    clearPatternStore();
    clearTriggers();
    clearAllListeners();
    clearEventHistory();
    clearDecisionRecords();
    resetMediationIdCounter();
  });

  describe('Full Decision Flow - Crisis Mode', () => {
    it('should handle crisis mode with pattern fallback', async () => {
      // Setup: Add a pattern
      const pattern = createMockPattern('CRISIS-001', 0.95);
      storePattern(pattern);

      // Calculate SDI - should be critical
      const components = createMockSDIComponents('critical');
      const sdi = computeSDIFromComponents(components);
      const classification = classifySDI(sdi, {
        critical: 100,
        warning: 1000,
        healthy: 10000,
        abundant: 100000,
        isProjectSpecific: false,
      });

      expect(classification).toBe(SDIClassification.CRITICAL);

      // Query success stack
      const engine1Output = await querySuccessStack({
        projectId: 'proj-001',
        contextSignature: createMockEigenmodeVector(),
        similarityThreshold: 0.7,
      });

      // Generate options (Engine 2)
      const engine2Output = generateOptions({
        projectId: 'proj-001',
        currentComponents: components,
        decisionContext: {
          triggerType: 'exception',
          constraints: [],
          resources: {},
        },
      });

      // Mediate decision
      const trigger: DecisionTrigger = {
        type: DecisionTriggerType.EXCEPTION,
        source: 'urn:luhtech:test:exception:E-001',
        urgency: 0.9,
        context: {},
      };

      const decision = await mediateDecision({
        projectId: 'proj-001',
        zoneId: 'zone-001',
        trigger,
        actorId: 'user-001',
        components,
        eigenmodeContext: createMockEigenmodeVector(),
        engine1Output,
        engine2Output,
      });

      // Should be Engine 1 in crisis mode
      expect(decision.sourceEngine).toBe(MediationSourceEngine.ENGINE_1);
      expect(decision.explorationAllocation).toBe(0);
      expect(decision.monitoringTriggers.length).toBe(0); // No monitoring in crisis
    });
  });

  describe('Full Decision Flow - Exploratory', () => {
    it('should handle exploratory path with monitoring', async () => {
      // Setup: Abundant SDI state
      const components = createMockSDIComponents('abundant');
      const sdi = computeSDIFromComponents(components);

      // Store a mediocre pattern (low confidence)
      const pattern = createMockPattern('EXPLORE-001', 0.5);
      storePattern(pattern);

      // Query success stack
      const engine1Output = await querySuccessStack({
        projectId: 'proj-001',
        contextSignature: createMockEigenmodeVector(),
        similarityThreshold: 0.7,
      });

      // Generate options with good exploration opportunity
      const engine2Output = generateOptions({
        projectId: 'proj-001',
        currentComponents: components,
        decisionContext: {
          triggerType: 'opportunity',
          constraints: [],
          resources: {
            laborHoursAvailable: 100,
            budgetRemaining: 50000,
          },
        },
        computationDepth: 5,
        includeRiskProfiles: true,
      });

      // Verify Engine 2 found options
      expect(engine2Output.viableOptions.length).toBeGreaterThan(0);

      // Mediate decision
      const trigger: DecisionTrigger = {
        type: DecisionTriggerType.OPPORTUNITY,
        source: 'urn:luhtech:test:opportunity:O-001',
        urgency: 0.3,
        context: {},
      };

      const decision = await mediateDecision({
        projectId: 'proj-001',
        zoneId: 'zone-001',
        trigger,
        actorId: 'user-001',
        components,
        eigenmodeContext: createMockEigenmodeVector(),
        engine1Output,
        engine2Output,
      });

      // Should have exploration allocation
      expect(decision.explorationAllocation).toBeGreaterThan(0);
    });
  });

  describe('Full Decision Flow - Learning Loop', () => {
    it('should complete full learning loop from decision to pattern', async () => {
      // Track events
      const events: string[] = [];
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_OUTCOME_RECORDED, () => {
        events.push('outcome_recorded');
      });

      // Setup
      const components = createMockSDIComponents('healthy');
      const engine1Output = await querySuccessStack({
        projectId: 'proj-001',
        contextSignature: createMockEigenmodeVector(),
        similarityThreshold: 0.7,
      });

      const engine2Output = generateOptions({
        projectId: 'proj-001',
        currentComponents: components,
        decisionContext: {
          triggerType: 'scheduled',
          constraints: [],
          resources: {},
        },
      });

      // Make decision
      const trigger: DecisionTrigger = {
        type: DecisionTriggerType.SCHEDULED,
        source: 'urn:luhtech:test:schedule:S-001',
        urgency: 0.3,
        context: {},
      };

      const decision = await mediateDecision({
        projectId: 'proj-001',
        trigger,
        actorId: 'user-001',
        components,
        eigenmodeContext: createMockEigenmodeVector(),
        engine1Output,
        engine2Output,
      });

      // Store decision record
      storeDecisionRecord({
        decisionEventUrn: decision.decisionEventUrn,
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: trigger.type,
        actionType: decision.selectedAction.actionType,
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: decision.sourceEngine,
        explorationAllocation: decision.explorationAllocation,
      });

      // Record outcome
      const outcomeResult = await recordDecisionOutcome({
        decisionEventUrn: decision.decisionEventUrn,
        success: true,
        actualVsProjected: 0.3,
        learningsExtracted: ['Integration test learning'],
        triggerPatternCompression: false,
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(outcomeResult.recorded).toBe(true);
      expect(outcomeResult.compressionEligible).toBe(true);
      expect(events).toContain('outcome_recorded');
    });
  });

  describe('Monitoring Trigger Flow', () => {
    it('should create and check monitoring triggers', async () => {
      const decisionUrn = 'urn:luhtech:proj-001:decision-event:DEV-MON-001';

      // Create SDI breach trigger
      createMonitoringTrigger({
        decisionEventUrn: decisionUrn,
        triggerType: MonitoringTriggerType.SDI_BREACH,
        condition: {
          metric: 'sdi',
          operator: '<',
          threshold: 5000,
        },
        response: MonitoringResponse.FALLBACK,
        checkIntervalMs: 60000,
      });

      // Check when SDI is above threshold (should not trigger)
      const result1 = checkAllTriggers('proj-001', { sdi: 10000 });
      expect(result1.triggersActivated.length).toBe(0);

      // Check when SDI drops below threshold (should trigger)
      const result2 = checkAllTriggers('proj-001', { sdi: 3000 });
      expect(result2.triggersActivated.length).toBe(1);
      expect(result2.triggersActivated[0].triggerType).toBe(MonitoringTriggerType.SDI_BREACH);
    });
  });

  describe('Exploration Budget Calculation', () => {
    it('should calculate budget correctly across SDI states', () => {
      const states: Array<'critical' | 'warning' | 'healthy' | 'abundant'> = [
        'critical', 'warning', 'healthy', 'abundant',
      ];
      const budgets: number[] = [];

      for (const state of states) {
        const components = createMockSDIComponents(state);
        const sdi = computeSDIFromComponents(components);

        const budget = calculateExplorationBudget({
          sdiValue: sdi,
          eigenmodeStability: components.eigenmodeStability,
          resourceSlackRatio: components.resourceSlackRatio,
        });

        budgets.push(budget.budget);
      }

      // Budget should increase as SDI state improves
      expect(budgets[0]).toBe(0); // Critical = 0
      expect(budgets[1]).toBeLessThan(budgets[2]); // Warning < Healthy
      expect(budgets[2]).toBeLessThan(budgets[3]); // Healthy < Abundant
    });

    it('should adjust budget for context', () => {
      const baseBudget = 0.6;

      // High urgency reduces budget
      const urgentBudget = adjustBudgetForContext(baseBudget, { urgency: 0.9 });
      expect(urgentBudget).toBeLessThan(baseBudget);

      // Exception reduces budget
      const exceptionBudget = adjustBudgetForContext(baseBudget, {
        triggerType: DecisionTriggerType.EXCEPTION,
      });
      expect(exceptionBudget).toBeLessThan(baseBudget);

      // Opportunity increases budget
      const opportunityBudget = adjustBudgetForContext(baseBudget, {
        triggerType: DecisionTriggerType.OPPORTUNITY,
      });
      expect(opportunityBudget).toBeGreaterThan(baseBudget);
    });
  });

  describe('Decision Path Selection', () => {
    it('should select correct paths based on state', () => {
      // Crisis mode
      const crisisPath = determineDecisionPath({
        sdiValue: 50,
        sdiClassification: SDIClassification.CRITICAL,
        engine1Confidence: 0.9,
        engine2BestOption: null,
        explorationBudget: 0,
        hasApplicablePatterns: true,
      });
      expect(crisisPath).toBe(MediationPath.CRISIS_MODE);

      // High confidence match
      const highConfPath = determineDecisionPath({
        sdiValue: 10000,
        sdiClassification: SDIClassification.HEALTHY,
        engine1Confidence: 0.95,
        engine2BestOption: null,
        explorationBudget: 0.5,
        hasApplicablePatterns: true,
      });
      expect(highConfPath).toBe(MediationPath.HIGH_CONFIDENCE_MATCH);

      // No patterns
      const noPatternPath = determineDecisionPath({
        sdiValue: 10000,
        sdiClassification: SDIClassification.HEALTHY,
        engine1Confidence: 0,
        engine2BestOption: null,
        explorationBudget: 0.5,
        hasApplicablePatterns: false,
      });
      expect(noPatternPath).toBe(MediationPath.NO_PATTERNS);
    });
  });

  describe('Statistics and Analytics', () => {
    it('should track learning statistics', () => {
      // Store some decisions
      for (let i = 0; i < 10; i++) {
        storeDecisionRecord({
          decisionEventUrn: `urn:luhtech:proj-001:decision-event:DEV-STAT-${i}`,
          projectId: 'proj-001',
          actorId: 'user-001',
          timestamp: new Date().toISOString(),
          triggerType: 'SCHEDULED',
          actionType: 'approve',
          eigenmodeContext: createMockEigenmodeVector(i / 10),
          sourceEngine: i % 3 === 0 ? MediationSourceEngine.ENGINE_2 : MediationSourceEngine.ENGINE_1,
          explorationAllocation: i % 3 === 0 ? 0.5 : 0,
          outcome: {
            success: i < 8, // 80% success
            actualVsProjected: i < 8 ? 0.2 : -0.1,
            downstreamEffects: [],
            learningsExtracted: [],
            recordedAt: new Date().toISOString(),
          },
        });
      }

      const stats = getLearningStatistics();

      expect(stats.totalDecisions).toBe(10);
      expect(stats.withOutcomes).toBe(10);
      expect(stats.successRate).toBe(0.8);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Dual-Process Performance', () => {
  beforeEach(() => {
    clearPatternStore();
    clearTriggers();
    clearAllListeners();
    clearEventHistory();
    clearDecisionRecords();
    resetMediationIdCounter();
  });

  it('should complete end-to-end mediation under 100ms', async () => {
    // Setup
    const components = createMockSDIComponents('healthy');
    const engine1Output = await querySuccessStack({
      projectId: 'proj-001',
      contextSignature: createMockEigenmodeVector(),
      similarityThreshold: 0.7,
    });

    const engine2Output = generateOptions({
      projectId: 'proj-001',
      currentComponents: components,
      decisionContext: {
        triggerType: 'scheduled',
        constraints: [],
        resources: {},
      },
    });

    const trigger: DecisionTrigger = {
      type: DecisionTriggerType.SCHEDULED,
      source: 'perf-test',
      urgency: 0.5,
      context: {},
    };

    // Measure
    const start = performance.now();
    const decision = await mediateDecision({
      projectId: 'proj-001',
      trigger,
      actorId: 'user-001',
      components,
      eigenmodeContext: createMockEigenmodeVector(),
      engine1Output,
      engine2Output,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(decision.mediationLatencyMs).toBeLessThan(100);
  });

  it('should handle 100 sequential decisions under 5 seconds', async () => {
    const components = createMockSDIComponents('healthy');
    const trigger: DecisionTrigger = {
      type: DecisionTriggerType.SCHEDULED,
      source: 'perf-test',
      urgency: 0.5,
      context: {},
    };

    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      const engine1Output = await querySuccessStack({
        projectId: 'proj-001',
        contextSignature: createMockEigenmodeVector(i / 100),
        similarityThreshold: 0.7,
      });

      const engine2Output = generateOptions({
        projectId: 'proj-001',
        currentComponents: components,
        decisionContext: {
          triggerType: 'scheduled',
          constraints: [],
          resources: {},
        },
        maxOptions: 5,
      });

      await mediateDecision({
        projectId: 'proj-001',
        trigger,
        actorId: 'user-001',
        components,
        eigenmodeContext: createMockEigenmodeVector(i / 100),
        engine1Output,
        engine2Output,
      });
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});
