/**
 * Decision Event Handler Service - DP-M6
 *
 * Handles decision events in the USF event system.
 * Integrates dual-process decisions with the broader event infrastructure.
 *
 * Event Types Handled:
 * - usf:decision-event:created
 * - usf:decision-event:mediated
 * - usf:decision-event:outcome-recorded
 * - usf:pattern:compression-started
 * - usf:pattern:compression-completed
 * - usf:pattern:merged
 * - usf:pattern:decayed
 * - usf:sdi:calculated
 * - usf:sdi:threshold-breached
 * - usf:exploration:triggered
 * - usf:exploration:monitored
 * - usf:exploration:fallback
 * - usf:mediation:escalated
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import {
  DUAL_PROCESS_EVENT_TYPES,
  SDIClassification,
  MediationSourceEngine,
  type DecisionEvent,
  type DecisionOutcome,
  type MediationDecision,
  type SuccessPattern,
  type SDISnapshot,
  type MonitoringTrigger,
  type DecisionEventURN,
} from '../types/dual-process.types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Base event payload
 */
export interface BaseEventPayload {
  eventType: string;
  timestamp: string;
  projectId: string;
  zoneId?: string;
  actorId?: string;
}

/**
 * Decision created event payload
 */
export interface DecisionCreatedPayload extends BaseEventPayload {
  eventType: typeof DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_CREATED;
  decisionEventUrn: string;
  triggerType: string;
  triggerSource: string;
}

/**
 * Decision mediated event payload
 */
export interface DecisionMediatedPayload extends BaseEventPayload {
  eventType: typeof DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_MEDIATED;
  decisionEventUrn: string;
  sourceEngine: MediationSourceEngine;
  selectedActionType: string;
  explorationAllocation: number;
  mediationLatencyMs: number;
}

/**
 * Outcome recorded event payload
 */
export interface OutcomeRecordedPayload extends BaseEventPayload {
  eventType: typeof DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_OUTCOME_RECORDED;
  decisionEventUrn: string;
  success: boolean;
  actualVsProjected: number;
  compressionTriggered: boolean;
}

/**
 * Pattern compression event payload
 */
export interface PatternCompressionPayload extends BaseEventPayload {
  eventType:
    | typeof DUAL_PROCESS_EVENT_TYPES.PATTERN_COMPRESSION_STARTED
    | typeof DUAL_PROCESS_EVENT_TYPES.PATTERN_COMPRESSION_COMPLETED
    | typeof DUAL_PROCESS_EVENT_TYPES.PATTERN_MERGED
    | typeof DUAL_PROCESS_EVENT_TYPES.PATTERN_DECAYED;
  decisionEventUrn: string;
  patternUrn?: string;
  action?: 'created' | 'merged' | 'skipped';
}

/**
 * SDI event payload
 */
export interface SDIEventPayload extends BaseEventPayload {
  eventType:
    | typeof DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED
    | typeof DUAL_PROCESS_EVENT_TYPES.SDI_THRESHOLD_BREACHED;
  sdiValue: number;
  classification: SDIClassification;
  previousClassification?: SDIClassification;
}

/**
 * Exploration event payload
 */
export interface ExplorationEventPayload extends BaseEventPayload {
  eventType:
    | typeof DUAL_PROCESS_EVENT_TYPES.EXPLORATION_TRIGGERED
    | typeof DUAL_PROCESS_EVENT_TYPES.EXPLORATION_MONITORED
    | typeof DUAL_PROCESS_EVENT_TYPES.EXPLORATION_FALLBACK;
  decisionEventUrn: string;
  triggerUrn?: string;
  reason?: string;
}

/**
 * Mediation escalated event payload
 */
export interface MediationEscalatedPayload extends BaseEventPayload {
  eventType: typeof DUAL_PROCESS_EVENT_TYPES.MEDIATION_ESCALATED;
  decisionEventUrn: string;
  escalationTarget: string;
  reason: string;
}

/**
 * Union of all event payloads
 */
export type DualProcessEventPayload =
  | DecisionCreatedPayload
  | DecisionMediatedPayload
  | OutcomeRecordedPayload
  | PatternCompressionPayload
  | SDIEventPayload
  | ExplorationEventPayload
  | MediationEscalatedPayload;

/**
 * Event handler function type
 */
export type EventHandler<T extends DualProcessEventPayload> = (
  payload: T
) => Promise<void>;

/**
 * Event listener registration
 */
export interface EventListener {
  eventType: string;
  handler: EventHandler<any>;
  priority: number;
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Registered event listeners
 */
const listeners: Map<string, EventListener[]> = new Map();

/**
 * Event queue for async processing
 */
const eventQueue: DualProcessEventPayload[] = [];

/**
 * Processing state
 */
let isProcessing = false;

/**
 * Event history for debugging/audit
 */
const eventHistory: Array<{
  payload: DualProcessEventPayload;
  processedAt: string;
  handlersExecuted: number;
}> = [];

const MAX_HISTORY_SIZE = 1000;

// ============================================================================
// Event Registration
// ============================================================================

/**
 * Register an event listener
 *
 * @param eventType - Event type to listen for
 * @param handler - Handler function
 * @param priority - Handler priority (higher = executed first)
 */
export function registerEventListener<T extends DualProcessEventPayload>(
  eventType: string,
  handler: EventHandler<T>,
  priority: number = 0
): void {
  if (!listeners.has(eventType)) {
    listeners.set(eventType, []);
  }

  listeners.get(eventType)!.push({
    eventType,
    handler,
    priority,
  });

  // Sort by priority (descending)
  listeners.get(eventType)!.sort((a, b) => b.priority - a.priority);
}

/**
 * Unregister an event listener
 *
 * @param eventType - Event type
 * @param handler - Handler to remove
 */
export function unregisterEventListener<T extends DualProcessEventPayload>(
  eventType: string,
  handler: EventHandler<T>
): void {
  const typeListeners = listeners.get(eventType);
  if (!typeListeners) {return;}

  const index = typeListeners.findIndex((l) => l.handler === handler);
  if (index >= 0) {
    typeListeners.splice(index, 1);
  }
}

/**
 * Clear all listeners (for testing)
 */
export function clearAllListeners(): void {
  listeners.clear();
}

// ============================================================================
// Event Emission
// ============================================================================

/**
 * Emit an event
 *
 * @param payload - Event payload
 * @param immediate - Process immediately vs queue
 */
export async function emitEvent(
  payload: DualProcessEventPayload,
  immediate: boolean = false
): Promise<void> {
  if (immediate) {
    await processEvent(payload);
  } else {
    eventQueue.push(payload);
    processQueue();
  }
}

/**
 * Process event queue
 */
async function processQueue(): Promise<void> {
  if (isProcessing) {return;}
  isProcessing = true;

  while (eventQueue.length > 0) {
    const payload = eventQueue.shift()!;
    await processEvent(payload);
  }

  isProcessing = false;
}

/**
 * Process a single event
 */
async function processEvent(payload: DualProcessEventPayload): Promise<void> {
  const typeListeners = listeners.get(payload.eventType) || [];
  let handlersExecuted = 0;

  for (const listener of typeListeners) {
    try {
      await listener.handler(payload);
      handlersExecuted++;
    } catch (error) {
      console.error(
        `Error in event handler for ${payload.eventType}:`,
        error
      );
    }
  }

  // Add to history
  eventHistory.push({
    payload,
    processedAt: new Date().toISOString(),
    handlersExecuted,
  });

  // Trim history if needed
  if (eventHistory.length > MAX_HISTORY_SIZE) {
    eventHistory.splice(0, eventHistory.length - MAX_HISTORY_SIZE);
  }
}

// ============================================================================
// Event Creation Helpers
// ============================================================================

/**
 * Create and emit decision created event
 */
export async function emitDecisionCreated(
  projectId: string,
  decisionEventUrn: string,
  triggerType: string,
  triggerSource: string,
  actorId?: string,
  zoneId?: string
): Promise<void> {
  await emitEvent({
    eventType: DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_CREATED,
    timestamp: new Date().toISOString(),
    projectId,
    zoneId,
    actorId,
    decisionEventUrn,
    triggerType,
    triggerSource,
  });
}

/**
 * Create and emit decision mediated event
 */
export async function emitDecisionMediated(
  projectId: string,
  decision: MediationDecision,
  actorId?: string,
  zoneId?: string
): Promise<void> {
  await emitEvent({
    eventType: DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_MEDIATED,
    timestamp: new Date().toISOString(),
    projectId,
    zoneId,
    actorId,
    decisionEventUrn: decision.decisionEventUrn,
    sourceEngine: decision.sourceEngine,
    selectedActionType: decision.selectedAction.actionType,
    explorationAllocation: decision.explorationAllocation,
    mediationLatencyMs: decision.mediationLatencyMs,
  });
}

/**
 * Create and emit outcome recorded event
 */
export async function emitOutcomeRecorded(
  projectId: string,
  decisionEventUrn: string,
  success: boolean,
  actualVsProjected: number,
  compressionTriggered: boolean,
  actorId?: string
): Promise<void> {
  await emitEvent({
    eventType: DUAL_PROCESS_EVENT_TYPES.DECISION_EVENT_OUTCOME_RECORDED,
    timestamp: new Date().toISOString(),
    projectId,
    actorId,
    decisionEventUrn,
    success,
    actualVsProjected,
    compressionTriggered,
  });
}

/**
 * Create and emit SDI calculated event
 */
export async function emitSDICalculated(
  projectId: string,
  sdiValue: number,
  classification: SDIClassification,
  zoneId?: string
): Promise<void> {
  await emitEvent({
    eventType: DUAL_PROCESS_EVENT_TYPES.SDI_CALCULATED,
    timestamp: new Date().toISOString(),
    projectId,
    zoneId,
    sdiValue,
    classification,
  });
}

/**
 * Create and emit SDI threshold breached event
 */
export async function emitSDIThresholdBreached(
  projectId: string,
  sdiValue: number,
  classification: SDIClassification,
  previousClassification: SDIClassification,
  zoneId?: string
): Promise<void> {
  await emitEvent({
    eventType: DUAL_PROCESS_EVENT_TYPES.SDI_THRESHOLD_BREACHED,
    timestamp: new Date().toISOString(),
    projectId,
    zoneId,
    sdiValue,
    classification,
    previousClassification,
  }, true); // Immediate for threshold breaches
}

/**
 * Create and emit exploration fallback event
 */
export async function emitExplorationFallback(
  projectId: string,
  decisionEventUrn: string,
  triggerUrn: string,
  reason: string,
  actorId?: string
): Promise<void> {
  await emitEvent({
    eventType: DUAL_PROCESS_EVENT_TYPES.EXPLORATION_FALLBACK,
    timestamp: new Date().toISOString(),
    projectId,
    actorId,
    decisionEventUrn,
    triggerUrn,
    reason,
  }, true); // Immediate for fallbacks
}

/**
 * Create and emit mediation escalated event
 */
export async function emitMediationEscalated(
  projectId: string,
  decisionEventUrn: string,
  escalationTarget: string,
  reason: string,
  actorId?: string
): Promise<void> {
  await emitEvent({
    eventType: DUAL_PROCESS_EVENT_TYPES.MEDIATION_ESCALATED,
    timestamp: new Date().toISOString(),
    projectId,
    actorId,
    decisionEventUrn,
    escalationTarget,
    reason,
  });
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get event history
 *
 * @param filter - Optional filter
 * @returns Filtered event history
 */
export function getEventHistory(
  filter?: {
    eventType?: string;
    projectId?: string;
    since?: string;
    limit?: number;
  }
): typeof eventHistory {
  let filtered = [...eventHistory];

  if (filter?.eventType) {
    filtered = filtered.filter((e) => e.payload.eventType === filter.eventType);
  }

  if (filter?.projectId) {
    filtered = filtered.filter((e) => e.payload.projectId === filter.projectId);
  }

  if (filter?.since) {
    const since = new Date(filter.since);
    filtered = filtered.filter((e) => new Date(e.processedAt) >= since);
  }

  if (filter?.limit) {
    filtered = filtered.slice(-filter.limit);
  }

  return filtered;
}

/**
 * Get registered listener count
 */
export function getListenerCount(eventType?: string): number {
  if (eventType) {
    return listeners.get(eventType)?.length || 0;
  }

  let total = 0;
  for (const typeListeners of listeners.values()) {
    total += typeListeners.length;
  }
  return total;
}

/**
 * Clear event history (for testing)
 */
export function clearEventHistory(): void {
  eventHistory.length = 0;
}

// ============================================================================
// Service Export
// ============================================================================

/**
 * Decision Event Handler Service namespace
 */
export const DecisionEventHandlerService = {
  // Registration
  registerEventListener,
  unregisterEventListener,
  clearAllListeners,

  // Emission
  emitEvent,
  emitDecisionCreated,
  emitDecisionMediated,
  emitOutcomeRecorded,
  emitSDICalculated,
  emitSDIThresholdBreached,
  emitExplorationFallback,
  emitMediationEscalated,

  // Query
  getEventHistory,
  getListenerCount,
  clearEventHistory,

  // Event types
  EVENT_TYPES: DUAL_PROCESS_EVENT_TYPES,
};

export default DecisionEventHandlerService;
