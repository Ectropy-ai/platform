/**
 * Decision Event Handler Service Tests - DP-M6
 *
 * Tests for the event handling and pattern learning services.
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  DecisionEventHandlerService,
  registerEventListener,
  unregisterEventListener,
  clearAllListeners,
  emitEvent,
  emitDecisionCreated,
  emitDecisionMediated,
  emitOutcomeRecorded,
  emitSDICalculated,
  emitSDIThresholdBreached,
  emitExplorationFallback,
  emitMediationEscalated,
  getEventHistory,
  getListenerCount,
  clearEventHistory,
} from '../decision-event-handler.service.js';

import {
  PatternLearningService,
  storeDecisionRecord,
  getDecisionRecord,
  recordDecisionOutcome,
  queueForCompression,
  processPendingCompressions,
  getLearningStatistics,
  getDecisionsByEngine,
  clearDecisionRecords,
  DEFAULT_LEARNING_CONFIG,
} from '../pattern-learning.service.js';

import type { EigenmodeVector } from '../../types/dual-process.types.js';

import {
  DUAL_PROCESS_EVENT_TYPES,
  SDIClassification,
  MediationSourceEngine,
} from '../../types/dual-process.types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockEigenmodeVector(): EigenmodeVector {
  return [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.1, 0.9, 0.5, 0.4, 0.6];
}

// ============================================================================
// Decision Event Handler Tests
// ============================================================================

describe('DecisionEventHandlerService', () => {
  beforeEach(() => {
    clearAllListeners();
    clearEventHistory();
  });

  describe('Event Listener Registration', () => {
    it('should register an event listener', () => {
      const handler = vi.fn();
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_CREATED, handler);

      expect(getListenerCount(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_CREATED)).toBe(1);
    });

    it('should register multiple listeners for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registerEventListener(DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED, handler1);
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED, handler2);

      expect(getListenerCount(DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED)).toBe(2);
    });

    it('should unregister a listener', () => {
      const handler = vi.fn();
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_CREATED, handler);
      unregisterEventListener(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_CREATED, handler);

      expect(getListenerCount(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_CREATED)).toBe(0);
    });

    it('should execute listeners by priority', async () => {
      const order: number[] = [];

      const lowPriority = vi.fn(() => { order.push(3); });
      const medPriority = vi.fn(() => { order.push(2); });
      const highPriority = vi.fn(() => { order.push(1); });

      registerEventListener(DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED, lowPriority, 0);
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED, highPriority, 100);
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED, medPriority, 50);

      await emitSDICalculated('proj-001', 10000, SDIClassification.HEALTHY);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('Event Emission', () => {
    it('should emit decision created event', async () => {
      const handler = vi.fn();
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_CREATED, handler);

      await emitDecisionCreated(
        'proj-001',
        'urn:luhtech:proj-001:decision-event:DEV-00000001',
        'SCHEDULED',
        'urn:luhtech:proj-001:voxel:V-001',
        'user-001',
        'zone-001'
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);
      const payload = handler.mock.calls[0][0];
      expect(payload.eventType).toBe(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_CREATED);
      expect(payload.projectId).toBe('proj-001');
    });

    it('should emit SDI threshold breached event immediately', async () => {
      const handler = vi.fn();
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.SDI_THRESHOLD_BREACHED, handler);

      await emitSDIThresholdBreached(
        'proj-001',
        50,
        SDIClassification.CRITICAL,
        SDIClassification.WARNING,
        'zone-001'
      );

      // Should be immediate, no delay needed
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit exploration fallback event immediately', async () => {
      const handler = vi.fn();
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.EXPLORATION_FALLBACK, handler);

      await emitExplorationFallback(
        'proj-001',
        'urn:luhtech:proj-001:decision-event:DEV-00000001',
        'urn:luhtech:proj-001:monitoring-trigger:MON-00000001',
        'SDI dropped below threshold',
        'user-001'
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit mediation escalated event', async () => {
      const handler = vi.fn();
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.MEDIATION_ESCALATED, handler);

      await emitMediationEscalated(
        'proj-001',
        'urn:luhtech:proj-001:decision-event:DEV-00000001',
        'urn:luhtech:ectropy:authority-level:pm-level-3',
        'No applicable patterns'
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event History', () => {
    it('should record events in history', async () => {
      await emitSDICalculated('proj-001', 10000, SDIClassification.HEALTHY);
      await emitSDICalculated('proj-002', 5000, SDIClassification.WARNING);

      await new Promise(resolve => setTimeout(resolve, 50));

      const history = getEventHistory();
      expect(history.length).toBe(2);
    });

    it('should filter history by event type', async () => {
      await emitSDICalculated('proj-001', 10000, SDIClassification.HEALTHY);
      await emitDecisionCreated('proj-001', 'DEV-001', 'SCHEDULED', 'source');

      await new Promise(resolve => setTimeout(resolve, 50));

      const filtered = getEventHistory({ eventType: DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED });
      expect(filtered.length).toBe(1);
    });

    it('should filter history by project', async () => {
      await emitSDICalculated('proj-001', 10000, SDIClassification.HEALTHY);
      await emitSDICalculated('proj-002', 5000, SDIClassification.WARNING);

      await new Promise(resolve => setTimeout(resolve, 50));

      const filtered = getEventHistory({ projectId: 'proj-001' });
      expect(filtered.length).toBe(1);
    });

    it('should limit history results', async () => {
      for (let i = 0; i < 10; i++) {
        await emitSDICalculated(`proj-${i}`, 10000, SDIClassification.HEALTHY);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const limited = getEventHistory({ limit: 5 });
      expect(limited.length).toBe(5);
    });
  });

  describe('Error Handling', () => {
    it('should continue processing after handler error', async () => {
      const failingHandler = vi.fn(() => { throw new Error('Test error'); });
      const successHandler = vi.fn();

      registerEventListener(DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED, failingHandler, 100);
      registerEventListener(DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED, successHandler, 0);

      await emitSDICalculated('proj-001', 10000, SDIClassification.HEALTHY);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(successHandler).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// Pattern Learning Service Tests
// ============================================================================

describe('PatternLearningService', () => {
  beforeEach(() => {
    clearDecisionRecords();
    clearAllListeners();
    clearEventHistory();
  });

  describe('Decision Record Storage', () => {
    it('should store a decision record', () => {
      storeDecisionRecord({
        decisionEventUrn: 'urn:luhtech:proj-001:decision-event:DEV-00000001',
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: 'SCHEDULED',
        actionType: 'approve',
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: MediationSourceEngine.ENGINE_1,
        explorationAllocation: 0,
      });

      const record = getDecisionRecord('urn:luhtech:proj-001:decision-event:DEV-00000001');
      expect(record).toBeDefined();
      expect(record!.actionType).toBe('approve');
    });

    it('should retrieve decision record by URN', () => {
      const urn = 'urn:luhtech:proj-001:decision-event:DEV-00000002';
      storeDecisionRecord({
        decisionEventUrn: urn,
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: 'EXCEPTION',
        actionType: 'escalate',
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: MediationSourceEngine.ESCALATE,
        explorationAllocation: 0,
      });

      const record = getDecisionRecord(urn);
      expect(record?.triggerType).toBe('EXCEPTION');
    });
  });

  describe('Outcome Recording', () => {
    it('should record successful outcome', async () => {
      const urn = 'urn:luhtech:proj-001:decision-event:DEV-00000003';
      storeDecisionRecord({
        decisionEventUrn: urn,
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: 'SCHEDULED',
        actionType: 'approve',
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: MediationSourceEngine.ENGINE_1,
        explorationAllocation: 0,
      });

      const result = await recordDecisionOutcome({
        decisionEventUrn: urn,
        success: true,
        actualVsProjected: 0.5,
        learningsExtracted: ['Pattern worked well'],
        triggerPatternCompression: false, // Don't auto-compress for test
      });

      expect(result.recorded).toBe(true);
      expect(result.compressionEligible).toBe(true);
    });

    it('should mark failed outcome as not eligible for compression', async () => {
      const urn = 'urn:luhtech:proj-001:decision-event:DEV-00000004';
      storeDecisionRecord({
        decisionEventUrn: urn,
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: 'SCHEDULED',
        actionType: 'approve',
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: MediationSourceEngine.ENGINE_1,
        explorationAllocation: 0,
      });

      const result = await recordDecisionOutcome({
        decisionEventUrn: urn,
        success: false,
        actualVsProjected: -0.5,
        triggerPatternCompression: false,
      });

      expect(result.recorded).toBe(true);
      expect(result.compressionEligible).toBe(false);
    });

    it('should return error for non-existent decision', async () => {
      const result = await recordDecisionOutcome({
        decisionEventUrn: 'urn:luhtech:proj-001:decision-event:DEV-NONEXISTENT',
        success: true,
        actualVsProjected: 0.5,
      });

      expect(result.recorded).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should not be eligible if improvement below threshold', async () => {
      const urn = 'urn:luhtech:proj-001:decision-event:DEV-00000005';
      storeDecisionRecord({
        decisionEventUrn: urn,
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: 'SCHEDULED',
        actionType: 'approve',
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: MediationSourceEngine.ENGINE_1,
        explorationAllocation: 0,
      });

      const result = await recordDecisionOutcome({
        decisionEventUrn: urn,
        success: true,
        actualVsProjected: 0.05, // Below 0.1 threshold
        triggerPatternCompression: false,
      });

      expect(result.compressionEligible).toBe(false);
    });
  });

  describe('Compression Queue', () => {
    it('should queue decision for compression', () => {
      const urn = 'urn:luhtech:proj-001:decision-event:DEV-00000006';
      storeDecisionRecord({
        decisionEventUrn: urn,
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: 'OPPORTUNITY',
        actionType: 'add_resource',
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: MediationSourceEngine.ENGINE_2,
        explorationAllocation: 0.5,
        outcome: {
          success: true,
          actualVsProjected: 0.3,
          downstreamEffects: [],
          learningsExtracted: [],
          recordedAt: new Date().toISOString(),
        },
      });

      const queued = queueForCompression(urn);
      expect(queued).toBe(true);
    });

    it('should not queue decision without outcome', () => {
      const urn = 'urn:luhtech:proj-001:decision-event:DEV-00000007';
      storeDecisionRecord({
        decisionEventUrn: urn,
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: 'SCHEDULED',
        actionType: 'approve',
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: MediationSourceEngine.ENGINE_1,
        explorationAllocation: 0,
      });

      const queued = queueForCompression(urn);
      expect(queued).toBe(false);
    });
  });

  describe('Learning Statistics', () => {
    it('should return empty statistics when no decisions', () => {
      const stats = getLearningStatistics();

      expect(stats.totalDecisions).toBe(0);
      expect(stats.withOutcomes).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it('should calculate correct statistics', () => {
      // Store some decisions with outcomes
      for (let i = 0; i < 5; i++) {
        storeDecisionRecord({
          decisionEventUrn: `urn:luhtech:proj-001:decision-event:DEV-STAT-${i}`,
          projectId: 'proj-001',
          actorId: 'user-001',
          timestamp: new Date().toISOString(),
          triggerType: 'SCHEDULED',
          actionType: 'approve',
          eigenmodeContext: createMockEigenmodeVector(),
          sourceEngine: MediationSourceEngine.ENGINE_1,
          explorationAllocation: 0,
          outcome: {
            success: i < 4, // 4 successful, 1 failed
            actualVsProjected: i < 4 ? 0.2 : -0.1,
            downstreamEffects: [],
            learningsExtracted: [],
            recordedAt: new Date().toISOString(),
          },
        });
      }

      const stats = getLearningStatistics();

      expect(stats.totalDecisions).toBe(5);
      expect(stats.withOutcomes).toBe(5);
      expect(stats.successRate).toBe(0.8); // 4/5
    });
  });

  describe('Decisions by Engine', () => {
    it('should count decisions by source engine', () => {
      storeDecisionRecord({
        decisionEventUrn: 'urn:luhtech:proj-001:decision-event:DEV-ENG-1',
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: 'SCHEDULED',
        actionType: 'approve',
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: MediationSourceEngine.ENGINE_1,
        explorationAllocation: 0,
      });

      storeDecisionRecord({
        decisionEventUrn: 'urn:luhtech:proj-001:decision-event:DEV-ENG-2',
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: 'OPPORTUNITY',
        actionType: 'add_resource',
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: MediationSourceEngine.ENGINE_2,
        explorationAllocation: 0.5,
      });

      storeDecisionRecord({
        decisionEventUrn: 'urn:luhtech:proj-001:decision-event:DEV-ENG-3',
        projectId: 'proj-001',
        actorId: 'user-001',
        timestamp: new Date().toISOString(),
        triggerType: 'SCHEDULED',
        actionType: 'defer',
        eigenmodeContext: createMockEigenmodeVector(),
        sourceEngine: MediationSourceEngine.BLEND,
        explorationAllocation: 0.3,
      });

      const byEngine = getDecisionsByEngine();

      expect(byEngine[MediationSourceEngine.ENGINE_1]).toBe(1);
      expect(byEngine[MediationSourceEngine.ENGINE_2]).toBe(1);
      expect(byEngine[MediationSourceEngine.BLEND]).toBe(1);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('DP-M6 Integration', () => {
  beforeEach(() => {
    clearDecisionRecords();
    clearAllListeners();
    clearEventHistory();
  });

  it('should emit events through the learning pipeline', async () => {
    const outcomeHandler = vi.fn();
    registerEventListener(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_OUTCOME_RECORDED, outcomeHandler);

    const urn = 'urn:luhtech:proj-001:decision-event:DEV-INT-001';
    storeDecisionRecord({
      decisionEventUrn: urn,
      projectId: 'proj-001',
      actorId: 'user-001',
      timestamp: new Date().toISOString(),
      triggerType: 'OPPORTUNITY',
      actionType: 'add_resource',
      eigenmodeContext: createMockEigenmodeVector(),
      sourceEngine: MediationSourceEngine.ENGINE_2,
      explorationAllocation: 0.6,
    });

    await recordDecisionOutcome({
      decisionEventUrn: urn,
      success: true,
      actualVsProjected: 0.4,
      downstreamEffects: [
        { affectedEntity: 'zone-002', effectType: 'positive', magnitude: 0.3 },
      ],
      learningsExtracted: ['New pattern discovered'],
      triggerPatternCompression: false,
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(outcomeHandler).toHaveBeenCalledTimes(1);
    const payload = outcomeHandler.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.compressionTriggered).toBe(false);
  });

  it('should track full decision lifecycle through events', async () => {
    const events: string[] = [];

    registerEventListener(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_CREATED, () => {
      events.push('created');
    });
    registerEventListener(DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED, () => {
      events.push('sdi_calculated');
    });
    registerEventListener(DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_OUTCOME_RECORDED, () => {
      events.push('outcome_recorded');
    });

    // Simulate decision lifecycle
    await emitDecisionCreated('proj-001', 'DEV-LC-001', 'SCHEDULED', 'source', 'user-001');
    await emitSDICalculated('proj-001', 10000, SDIClassification.HEALTHY);

    const urn = 'urn:luhtech:proj-001:decision-event:DEV-LC-001';
    storeDecisionRecord({
      decisionEventUrn: urn,
      projectId: 'proj-001',
      actorId: 'user-001',
      timestamp: new Date().toISOString(),
      triggerType: 'SCHEDULED',
      actionType: 'approve',
      eigenmodeContext: createMockEigenmodeVector(),
      sourceEngine: MediationSourceEngine.ENGINE_1,
      explorationAllocation: 0,
    });

    await recordDecisionOutcome({
      decisionEventUrn: urn,
      success: true,
      actualVsProjected: 0.2,
      triggerPatternCompression: false,
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(events).toContain('created');
    expect(events).toContain('sdi_calculated');
    expect(events).toContain('outcome_recorded');
  });
});
