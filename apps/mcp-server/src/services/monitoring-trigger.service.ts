/**
 * Monitoring Trigger Service - DP-M5
 *
 * Manages monitoring triggers for exploratory decisions.
 * When Engine 2 (exploration) is chosen, triggers monitor for:
 * - SDI breaches
 * - Timeline deviations
 * - Resource exhaustion
 * - Cascade effects
 * - Confidence collapse
 *
 * If triggered, executes appropriate response:
 * - FALLBACK: Fall back to validated pattern
 * - ESCALATE: Escalate to higher authority
 * - CONSTRAIN: Add constraints to exploration
 * - RE_MEDIATE: Run mediation again
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import {
  MonitoringTriggerType,
  MonitoringResponse,
  type MonitoringTrigger,
  type MonitoringTriggerURN,
  type Action,
} from '../types/dual-process.types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for creating a monitoring trigger
 */
export interface CreateTriggerInput {
  decisionEventUrn: string;
  triggerType: MonitoringTriggerType;
  condition: {
    metric: string;
    operator: '<' | '>' | '<=' | '>=' | '==' | '!=';
    threshold: number;
  };
  response: MonitoringResponse;
  checkIntervalMs: number;
}

/**
 * Result of checking a trigger
 */
export interface TriggerCheckResult {
  triggered: boolean;
  skipped?: boolean;
  currentValue?: number;
  threshold?: number;
  error?: string;
}

/**
 * Result of executing a trigger response
 */
export interface TriggerExecutionResult {
  executed: boolean;
  response: MonitoringResponse;
  action?: Action;
  error?: string;
}

/**
 * Result of checking all triggers
 */
export interface CheckAllTriggersResult {
  triggersChecked: number;
  triggersActivated: Array<{
    triggerUrn: string;
    triggerType: MonitoringTriggerType;
    currentValue: number;
    threshold: number;
    response: MonitoringResponse;
    responseExecuted: boolean;
  }>;
}

/**
 * Options for checking all triggers
 */
export interface CheckAllTriggersOptions {
  decisionEventUrn?: string;
  executeResponses?: boolean;
}

/**
 * Metrics object for trigger checking
 */
export type TriggerMetrics = Record<string, number>;

/**
 * Configuration for monitoring trigger service
 */
export interface MonitoringTriggerConfig {
  minCheckIntervalMs: number;
  maxTriggersPerDecision: number;
  defaultCheckIntervalMs: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration
 */
export const DEFAULT_MONITORING_CONFIG: MonitoringTriggerConfig = {
  minCheckIntervalMs: 1000,
  maxTriggersPerDecision: 10,
  defaultCheckIntervalMs: 60000,
};

// ============================================================================
// State Management
// ============================================================================

/**
 * In-memory trigger storage
 * Maps decision event URN to array of triggers
 */
const triggerStore: Map<string, MonitoringTrigger[]> = new Map();

/**
 * Project index for efficient lookups
 */
const projectIndex: Map<string, Set<string>> = new Map();

/**
 * Trigger ID counter
 */
let triggerIdCounter = 0;

/**
 * Generate trigger URN
 */
function generateTriggerUrn(decisionEventUrn: string): MonitoringTriggerURN {
  const id = (++triggerIdCounter).toString().padStart(8, '0');
  // Extract project from decision event URN
  const parts = decisionEventUrn.split(':');
  const project = parts[2] || 'default';
  return `urn:luhtech:${project}:monitoring-trigger:MON-${id}` as MonitoringTriggerURN;
}

/**
 * Extract project from URN
 */
function extractProject(urn: string): string {
  const parts = urn.split(':');
  return parts[2] || 'default';
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Create a monitoring trigger for a decision
 *
 * @param input - Trigger creation input
 * @returns Created trigger
 */
export function createMonitoringTrigger(input: CreateTriggerInput): MonitoringTrigger {
  const {
    decisionEventUrn,
    triggerType,
    condition,
    response,
    checkIntervalMs,
  } = input;

  // Enforce minimum check interval
  const effectiveInterval = Math.max(
    checkIntervalMs,
    DEFAULT_MONITORING_CONFIG.minCheckIntervalMs
  );

  const trigger: MonitoringTrigger = {
    $id: generateTriggerUrn(decisionEventUrn),
    decisionEventUrn,
    triggerType,
    condition,
    response,
    checkIntervalMs: effectiveInterval,
    isActive: true,
  };

  // Store the trigger
  if (!triggerStore.has(decisionEventUrn)) {
    triggerStore.set(decisionEventUrn, []);
  }
  triggerStore.get(decisionEventUrn)!.push(trigger);

  // Update project index
  const project = extractProject(decisionEventUrn);
  if (!projectIndex.has(project)) {
    projectIndex.set(project, new Set());
  }
  projectIndex.get(project)!.add(decisionEventUrn);

  return trigger;
}

/**
 * Get active triggers for a decision event
 *
 * @param decisionEventUrn - Decision event URN
 * @returns Array of active triggers
 */
export function getActiveTriggers(decisionEventUrn: string): MonitoringTrigger[] {
  const triggers = triggerStore.get(decisionEventUrn) || [];
  return triggers.filter((t) => t.isActive);
}

/**
 * Get all triggers for a project
 *
 * @param projectId - Project identifier
 * @returns Array of triggers
 */
export function getProjectTriggers(projectId: string): MonitoringTrigger[] {
  const decisionUrns = projectIndex.get(projectId);
  if (!decisionUrns) {
    return [];
  }

  const triggers: MonitoringTrigger[] = [];
  for (const urn of decisionUrns) {
    const decisionTriggers = triggerStore.get(urn) || [];
    triggers.push(...decisionTriggers);
  }
  return triggers;
}

/**
 * Check if a trigger condition is met
 *
 * @param trigger - Trigger to check
 * @param metrics - Current metrics values
 * @returns Check result
 */
export function checkTrigger(
  trigger: MonitoringTrigger,
  metrics: TriggerMetrics
): TriggerCheckResult {
  // Skip inactive triggers
  if (!trigger.isActive) {
    return { triggered: false, skipped: true };
  }

  const { metric, operator, threshold } = trigger.condition;

  // Check if metric exists
  if (!(metric in metrics)) {
    return {
      triggered: false,
      error: `Metric '${metric}' not found in provided metrics`,
    };
  }

  const currentValue = metrics[metric];
  let triggered = false;

  // Evaluate condition
  switch (operator) {
    case '<':
      triggered = currentValue < threshold;
      break;
    case '>':
      triggered = currentValue > threshold;
      break;
    case '<=':
      triggered = currentValue <= threshold;
      break;
    case '>=':
      triggered = currentValue >= threshold;
      break;
    case '==':
      triggered = currentValue === threshold;
      break;
    case '!=':
      triggered = currentValue !== threshold;
      break;
    default:
      return { triggered: false, error: `Unknown operator: ${operator}` };
  }

  // Update last checked timestamp
  trigger.lastChecked = new Date().toISOString();

  return {
    triggered,
    currentValue,
    threshold,
  };
}

/**
 * Check all triggers for a project
 *
 * @param projectId - Project identifier
 * @param metrics - Current metrics values
 * @param options - Check options
 * @returns Check results
 */
export function checkAllTriggers(
  projectId: string,
  metrics: TriggerMetrics,
  options: CheckAllTriggersOptions = {}
): CheckAllTriggersResult {
  const { decisionEventUrn, executeResponses = false } = options;

  // Get triggers to check
  let triggers: MonitoringTrigger[];

  if (decisionEventUrn) {
    // Check only triggers for specific decision
    triggers = getActiveTriggers(decisionEventUrn);
  } else {
    // Check all project triggers
    triggers = getProjectTriggers(projectId).filter((t) => t.isActive);
  }

  const result: CheckAllTriggersResult = {
    triggersChecked: triggers.length,
    triggersActivated: [],
  };

  for (const trigger of triggers) {
    const checkResult = checkTrigger(trigger, metrics);

    if (checkResult.triggered) {
      let responseExecuted = false;

      if (executeResponses) {
        const execResult = executeTriggerResponse(trigger, metrics);
        responseExecuted = execResult.executed;
      }

      result.triggersActivated.push({
        triggerUrn: trigger.$id!,
        triggerType: trigger.triggerType,
        currentValue: checkResult.currentValue!,
        threshold: trigger.condition.threshold,
        response: trigger.response,
        responseExecuted,
      });
    }
  }

  return result;
}

/**
 * Execute response for a triggered monitor
 *
 * @param trigger - The triggered trigger
 * @param metrics - Current metrics for context
 * @returns Execution result
 */
export function executeTriggerResponse(
  trigger: MonitoringTrigger,
  metrics: TriggerMetrics
): TriggerExecutionResult {
  // Mark trigger as triggered
  trigger.triggeredAt = new Date().toISOString();

  // Generate response action based on response type
  let action: Action;

  switch (trigger.response) {
    case MonitoringResponse.FALLBACK:
      action = {
        actionType: 'fallback_to_pattern',
        targetUrn: trigger.decisionEventUrn,
        parameters: {
          reason: `Trigger ${trigger.triggerType} activated`,
          metric: trigger.condition.metric,
          threshold: trigger.condition.threshold,
          currentValue: metrics[trigger.condition.metric],
        },
      };
      break;

    case MonitoringResponse.ESCALATE:
      action = {
        actionType: 'escalate',
        targetUrn: trigger.decisionEventUrn,
        parameters: {
          reason: `Trigger ${trigger.triggerType} activated`,
          metric: trigger.condition.metric,
          threshold: trigger.condition.threshold,
          currentValue: metrics[trigger.condition.metric],
          urgency: 'high',
        },
      };
      break;

    case MonitoringResponse.CONSTRAIN:
      action = {
        actionType: 'add_constraint',
        targetUrn: trigger.decisionEventUrn,
        parameters: {
          constraintType: trigger.condition.metric,
          constraintValue: trigger.condition.threshold,
          reason: `Trigger ${trigger.triggerType} activated`,
        },
      };
      break;

    case MonitoringResponse.RE_MEDIATE:
      action = {
        actionType: 're_mediate',
        targetUrn: trigger.decisionEventUrn,
        parameters: {
          reason: `Trigger ${trigger.triggerType} activated - re-evaluation required`,
          previousMetrics: metrics,
        },
      };
      break;

    default:
      return {
        executed: false,
        response: trigger.response,
        error: `Unknown response type: ${trigger.response}`,
      };
  }

  return {
    executed: true,
    response: trigger.response,
    action,
  };
}

/**
 * Deactivate a trigger
 *
 * @param triggerUrn - Trigger URN to deactivate
 * @returns Whether deactivation was successful
 */
export function deactivateTrigger(triggerUrn: string): boolean {
  for (const triggers of triggerStore.values()) {
    const trigger = triggers.find((t) => t.$id === triggerUrn);
    if (trigger) {
      trigger.isActive = false;
      return true;
    }
  }
  return false;
}

/**
 * Clear all triggers (for testing)
 */
export function clearTriggers(): void {
  triggerStore.clear();
  projectIndex.clear();
  triggerIdCounter = 0;
}

/**
 * Reset trigger ID counter (for testing)
 */
export function resetTriggerIdCounter(value: number = 0): void {
  triggerIdCounter = value;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create standard SDI breach trigger
 *
 * @param decisionEventUrn - Decision event URN
 * @param threshold - SDI threshold
 * @param response - Response action
 * @returns Created trigger
 */
export function createSDIBreachTrigger(
  decisionEventUrn: string,
  threshold: number,
  response: MonitoringResponse = MonitoringResponse.FALLBACK
): MonitoringTrigger {
  return createMonitoringTrigger({
    decisionEventUrn,
    triggerType: MonitoringTriggerType.SDI_BREACH,
    condition: {
      metric: 'sdi',
      operator: '<',
      threshold,
    },
    response,
    checkIntervalMs: DEFAULT_MONITORING_CONFIG.defaultCheckIntervalMs,
  });
}

/**
 * Create standard timeline deviation trigger
 *
 * @param decisionEventUrn - Decision event URN
 * @param daysThreshold - Days late threshold
 * @param response - Response action
 * @returns Created trigger
 */
export function createTimelineDeviationTrigger(
  decisionEventUrn: string,
  daysThreshold: number,
  response: MonitoringResponse = MonitoringResponse.ESCALATE
): MonitoringTrigger {
  return createMonitoringTrigger({
    decisionEventUrn,
    triggerType: MonitoringTriggerType.TIMELINE_DEVIATION,
    condition: {
      metric: 'daysLate',
      operator: '>',
      threshold: daysThreshold,
    },
    response,
    checkIntervalMs: DEFAULT_MONITORING_CONFIG.defaultCheckIntervalMs,
  });
}

/**
 * Create standard resource exhaustion trigger
 *
 * @param decisionEventUrn - Decision event URN
 * @param resourceMetric - Resource metric name
 * @param threshold - Threshold value
 * @param response - Response action
 * @returns Created trigger
 */
export function createResourceExhaustionTrigger(
  decisionEventUrn: string,
  resourceMetric: string,
  threshold: number,
  response: MonitoringResponse = MonitoringResponse.CONSTRAIN
): MonitoringTrigger {
  return createMonitoringTrigger({
    decisionEventUrn,
    triggerType: MonitoringTriggerType.RESOURCE_EXHAUSTION,
    condition: {
      metric: resourceMetric,
      operator: '<',
      threshold,
    },
    response,
    checkIntervalMs: DEFAULT_MONITORING_CONFIG.defaultCheckIntervalMs,
  });
}

/**
 * Create standard monitoring triggers for an exploratory decision
 *
 * @param decisionEventUrn - Decision event URN
 * @param currentSdi - Current SDI value
 * @returns Array of created triggers
 */
export function createStandardMonitoringTriggers(
  decisionEventUrn: string,
  currentSdi: number
): MonitoringTrigger[] {
  const triggers: MonitoringTrigger[] = [];

  // SDI breach trigger: alert if SDI drops 20% from current
  triggers.push(
    createSDIBreachTrigger(
      decisionEventUrn,
      currentSdi * 0.8,
      MonitoringResponse.FALLBACK
    )
  );

  // Critical SDI trigger: escalate if SDI drops below 1000
  triggers.push(
    createSDIBreachTrigger(decisionEventUrn, 1000, MonitoringResponse.ESCALATE)
  );

  // Timeline deviation: escalate if more than 3 days late
  triggers.push(createTimelineDeviationTrigger(decisionEventUrn, 3));

  return triggers;
}

// ============================================================================
// Service Export
// ============================================================================

/**
 * Monitoring Trigger Service namespace
 */
export const MonitoringTriggerService = {
  // Core functions
  createMonitoringTrigger,
  getActiveTriggers,
  getProjectTriggers,
  checkTrigger,
  checkAllTriggers,
  executeTriggerResponse,
  deactivateTrigger,
  clearTriggers,
  resetTriggerIdCounter,

  // Convenience functions
  createSDIBreachTrigger,
  createTimelineDeviationTrigger,
  createResourceExhaustionTrigger,
  createStandardMonitoringTriggers,

  // Configuration
  DEFAULT_MONITORING_CONFIG,
};

export default MonitoringTriggerService;
