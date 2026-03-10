/**
 * USF Mediator Service - DP-M5
 *
 * Arbitrates between Engine 1 (Success Stack) and Engine 2 (Possibility Space).
 * Implements the 5 decision paths based on SDI, confidence, and exploration budget.
 *
 * Decision Paths:
 * 1. CRISIS_MODE: SDI < critical → Engine 1 only
 * 2. HIGH_CONFIDENCE_MATCH: Engine 1 confidence > 0.9 → Engine 1 with minimal exploration
 * 3. PROMISING_EXPLORATION: Engine 2 significantly better + budget → Engine 2 with fallback
 * 4. NO_PATTERNS: No applicable patterns → Escalate or lowest-risk
 * 5. DEFAULT_BLEND: Otherwise → Weighted blend based on budget
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import {
  SDIClassification,
  MediationSourceEngine,
  DEFAULT_DUAL_PROCESS_CONFIG,
  type EigenmodeVector,
  type SDIComponents,
  type DecisionTrigger,
  type Engine1Output,
  type Engine2Output,
  type MediationDecision,
  type MonitoringTrigger,
  type Action,
  type DecisionEventURN,
} from '../types/dual-process.types.js';

import {
  calculateExplorationBudget,
  adjustBudgetForContext,
  calculateExplorationAllocation,
} from './exploration-budget.service.js';

import {
  createStandardMonitoringTriggers,
} from './monitoring-trigger.service.js';

import {
  computeSDIFromComponents,
  classifySDI,
} from './sdi-calculator.service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Mediation decision paths
 */
export enum MediationPath {
  CRISIS_MODE = 'CRISIS_MODE',
  HIGH_CONFIDENCE_MATCH = 'HIGH_CONFIDENCE_MATCH',
  PROMISING_EXPLORATION = 'PROMISING_EXPLORATION',
  NO_PATTERNS = 'NO_PATTERNS',
  DEFAULT_BLEND = 'DEFAULT_BLEND',
}

/**
 * Input for determining decision path
 */
export interface DecisionPathInput {
  sdiValue: number;
  sdiClassification: SDIClassification;
  engine1Confidence: number;
  engine2BestOption: {
    projectedSdi: number;
    explorationValue: number;
    feasibilityScore: number;
  } | null;
  explorationBudget: number;
  hasApplicablePatterns: boolean;
}

/**
 * Result of action selection
 */
export interface ActionSelectionResult {
  action: Action;
  source: MediationSourceEngine;
  explorationAllocation: number;
  fallbackAction?: Action;
  requiresMonitoring: boolean;
}

/**
 * Input for mediation
 */
export interface MediationInput {
  projectId: string;
  zoneId?: string;
  trigger: DecisionTrigger;
  actorId: string;
  components: SDIComponents;
  eigenmodeContext: EigenmodeVector;
  engine1Output: Engine1Output;
  engine2Output: Engine2Output;
  forceEngine?: 'engine1' | 'engine2';
  dryRun?: boolean;
}

/**
 * Configuration for USF mediator
 */
export interface USFMediatorConfig {
  crisisThreshold: number;
  highConfidenceThreshold: number;
  significantImprovementThreshold: number;
  minimalExploration: number;
  defaultEscalationTarget: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default mediator configuration
 */
export const DEFAULT_MEDIATOR_CONFIG: USFMediatorConfig = {
  crisisThreshold: DEFAULT_DUAL_PROCESS_CONFIG.sdiCriticalThreshold,
  highConfidenceThreshold: 0.9,
  significantImprovementThreshold: 0.3, // 30% improvement to be "significant"
  minimalExploration: 0.1,
  defaultEscalationTarget: 'urn:luhtech:ectropy:authority-level:pm-level-3',
};

/**
 * Default thresholds
 */
const DEFAULT_THRESHOLDS = {
  critical: DEFAULT_DUAL_PROCESS_CONFIG.sdiCriticalThreshold,
  warning: DEFAULT_DUAL_PROCESS_CONFIG.sdiWarningThreshold,
  healthy: DEFAULT_DUAL_PROCESS_CONFIG.sdiHealthyThreshold,
  abundant: DEFAULT_DUAL_PROCESS_CONFIG.sdiAbundantThreshold,
  isProjectSpecific: false,
};

// ============================================================================
// ID Generation
// ============================================================================

let mediationIdCounter = 0;

/**
 * Generate decision event URN
 */
function generateDecisionEventUrn(projectId: string, dryRun: boolean = false): DecisionEventURN {
  const id = (++mediationIdCounter).toString().padStart(8, '0');
  const prefix = dryRun ? 'DRY' : 'DEV';
  return `urn:luhtech:${projectId}:decision-event:${prefix}-${id}` as DecisionEventURN;
}

/**
 * Reset mediation ID counter (for testing)
 */
export function resetMediationIdCounter(value: number = 0): void {
  mediationIdCounter = value;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Determine which decision path to follow
 *
 * @param input - Decision path input
 * @param config - Mediator configuration
 * @returns Selected decision path
 */
export function determineDecisionPath(
  input: DecisionPathInput,
  config: USFMediatorConfig = DEFAULT_MEDIATOR_CONFIG
): MediationPath {
  const {
    sdiValue,
    sdiClassification,
    engine1Confidence,
    engine2BestOption,
    explorationBudget,
    hasApplicablePatterns,
  } = input;

  // Path 1: Crisis Mode
  // SDI below critical threshold - use validated patterns only
  if (sdiClassification === SDIClassification.CRITICAL || sdiValue < config.crisisThreshold) {
    return MediationPath.CRISIS_MODE;
  }

  // Path 2: High Confidence Match
  // Engine 1 has very high confidence - trust the pattern
  if (engine1Confidence > config.highConfidenceThreshold && hasApplicablePatterns) {
    return MediationPath.HIGH_CONFIDENCE_MATCH;
  }

  // Path 3: Promising Exploration
  // Engine 2 offers significantly better outcome AND we have exploration budget
  if (
    engine2BestOption &&
    explorationBudget > 0.2 &&
    engine2BestOption.feasibilityScore > 0.7
  ) {
    const improvement = (engine2BestOption.projectedSdi - sdiValue) / sdiValue;
    if (improvement > config.significantImprovementThreshold) {
      return MediationPath.PROMISING_EXPLORATION;
    }
  }

  // Path 4: No Patterns
  // No applicable patterns from Engine 1
  if (!hasApplicablePatterns || engine1Confidence === 0) {
    return MediationPath.NO_PATTERNS;
  }

  // Path 5: Default Blend
  // Mix of Engine 1 and Engine 2 based on budget
  return MediationPath.DEFAULT_BLEND;
}

/**
 * Select action based on decision path
 *
 * @param path - Selected decision path
 * @param engine1Output - Engine 1 output
 * @param engine2Output - Engine 2 output
 * @param explorationBudget - Available exploration budget
 * @param config - Mediator configuration
 * @returns Action selection result
 */
export function selectAction(
  path: MediationPath,
  engine1Output: Engine1Output,
  engine2Output: Engine2Output,
  explorationBudget: number,
  config: USFMediatorConfig = DEFAULT_MEDIATOR_CONFIG
): ActionSelectionResult {
  switch (path) {
    case MediationPath.CRISIS_MODE:
      return selectCrisisModeAction(engine1Output, engine2Output);

    case MediationPath.HIGH_CONFIDENCE_MATCH:
      return selectHighConfidenceAction(engine1Output, config);

    case MediationPath.PROMISING_EXPLORATION:
      return selectExploratoryAction(engine1Output, engine2Output, explorationBudget);

    case MediationPath.NO_PATTERNS:
      return selectNoPatternsAction(engine1Output, engine2Output, config);

    case MediationPath.DEFAULT_BLEND:
    default:
      return selectBlendedAction(engine1Output, engine2Output, explorationBudget);
  }
}

/**
 * Select action for Crisis Mode
 * Engine 1 only, no exploration
 */
function selectCrisisModeAction(
  engine1Output: Engine1Output,
  engine2Output: Engine2Output
): ActionSelectionResult {
  // Use Engine 1 recommended action if available
  if (engine1Output.recommendedAction) {
    return {
      action: engine1Output.recommendedAction,
      source: MediationSourceEngine.ENGINE_1,
      explorationAllocation: 0,
      requiresMonitoring: false,
    };
  }

  // Fallback to safest Engine 2 option
  const safeOption = findLowestRiskOption(engine2Output);
  if (safeOption) {
    return {
      action: safeOption,
      source: MediationSourceEngine.ENGINE_1,
      explorationAllocation: 0,
      requiresMonitoring: false,
    };
  }

  // Ultimate fallback: defer
  return {
    action: createDeferAction(),
    source: MediationSourceEngine.ENGINE_1,
    explorationAllocation: 0,
    requiresMonitoring: false,
  };
}

/**
 * Select action for High Confidence Match
 * Engine 1 with minimal exploration
 */
function selectHighConfidenceAction(
  engine1Output: Engine1Output,
  config: USFMediatorConfig
): ActionSelectionResult {
  return {
    action: engine1Output.recommendedAction || createDeferAction(),
    source: MediationSourceEngine.ENGINE_1,
    explorationAllocation: config.minimalExploration,
    requiresMonitoring: false,
  };
}

/**
 * Select action for Promising Exploration
 * Engine 2 with fallback to Engine 1
 */
function selectExploratoryAction(
  engine1Output: Engine1Output,
  engine2Output: Engine2Output,
  explorationBudget: number
): ActionSelectionResult {
  const bestOption = engine2Output.viableOptions[0];

  if (!bestOption) {
    // No viable options, fall back to Engine 1
    return {
      action: engine1Output.recommendedAction || createDeferAction(),
      source: MediationSourceEngine.ENGINE_1,
      explorationAllocation: 0,
      fallbackAction: createDeferAction(),
      requiresMonitoring: false,
    };
  }

  // Use Engine 2 with fallback
  const fallback = createFallbackAction(engine1Output, engine2Output);

  return {
    action: bestOption.action,
    source: MediationSourceEngine.ENGINE_2,
    explorationAllocation: explorationBudget,
    fallbackAction: fallback,
    requiresMonitoring: true,
  };
}

/**
 * Select action for No Patterns path
 * Escalate or use lowest-risk option
 */
function selectNoPatternsAction(
  engine1Output: Engine1Output,
  engine2Output: Engine2Output,
  config: USFMediatorConfig
): ActionSelectionResult {
  // Try to find a low-risk Engine 2 option
  const safeOption = findLowestRiskOption(engine2Output);

  if (safeOption && safeOption.actionType !== 'escalate') {
    return {
      action: safeOption,
      source: MediationSourceEngine.ENGINE_2,
      explorationAllocation: 1.0, // Full exploration since no patterns
      fallbackAction: createEscalateAction(config.defaultEscalationTarget),
      requiresMonitoring: true,
    };
  }

  // Default: escalate to higher authority
  return {
    action: createEscalateAction(config.defaultEscalationTarget),
    source: MediationSourceEngine.ESCALATE,
    explorationAllocation: 0,
    requiresMonitoring: false,
  };
}

/**
 * Select blended action from both engines
 */
function selectBlendedAction(
  engine1Output: Engine1Output,
  engine2Output: Engine2Output,
  explorationBudget: number
): ActionSelectionResult {
  const engine1Action = engine1Output.recommendedAction;
  const engine2Best = engine2Output.viableOptions[0];

  // Neither engine has recommendation
  if (!engine1Action && !engine2Best) {
    return {
      action: createDeferAction(),
      source: MediationSourceEngine.BLEND,
      explorationAllocation: 0,
      requiresMonitoring: false,
    };
  }

  // Only Engine 1 has recommendation
  if (!engine2Best) {
    return {
      action: engine1Action!,
      source: MediationSourceEngine.BLEND,
      explorationAllocation: 0,
      requiresMonitoring: false,
    };
  }

  // Only Engine 2 has recommendation
  if (!engine1Action) {
    return {
      action: engine2Best.action,
      source: MediationSourceEngine.BLEND,
      explorationAllocation: explorationBudget,
      fallbackAction: createDeferAction(),
      requiresMonitoring: true,
    };
  }

  // Both engines have recommendations - blend based on budget
  const explorationAllocation = calculateExplorationAllocation(
    explorationBudget,
    engine1Output.confidence,
    engine2Best.explorationValue
  );

  // If exploration allocation is high, prefer Engine 2
  if (explorationAllocation > 0.5) {
    return {
      action: engine2Best.action,
      source: MediationSourceEngine.BLEND,
      explorationAllocation,
      fallbackAction: engine1Action,
      requiresMonitoring: true,
    };
  }

  // Otherwise prefer Engine 1
  return {
    action: engine1Action,
    source: MediationSourceEngine.BLEND,
    explorationAllocation,
    requiresMonitoring: false,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find lowest risk option from Engine 2
 */
function findLowestRiskOption(engine2Output: Engine2Output): Action | undefined {
  const options = [...engine2Output.viableOptions].sort((a, b) => {
    const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    const riskDiff = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    if (riskDiff !== 0) {return riskDiff;}
    return b.feasibilityScore - a.feasibilityScore;
  });

  return options[0]?.action;
}

/**
 * Create fallback action from available options
 */
export function createFallbackAction(
  engine1Output: Engine1Output,
  engine2Output: Engine2Output
): Action {
  // Prefer Engine 1 validated pattern
  if (engine1Output.recommendedAction) {
    return engine1Output.recommendedAction;
  }

  // Use lowest risk Engine 2 option
  const safeOption = findLowestRiskOption(engine2Output);
  if (safeOption) {
    return safeOption;
  }

  // Default to defer
  return createDeferAction();
}

/**
 * Create defer action
 */
function createDeferAction(): Action {
  return {
    actionType: 'defer',
    targetUrn: '',
    parameters: { reason: 'No clear path forward, deferring decision' },
  };
}

/**
 * Create escalate action
 */
function createEscalateAction(target: string): Action {
  return {
    actionType: 'escalate',
    targetUrn: target,
    parameters: { reason: 'No applicable patterns, escalating to higher authority' },
  };
}

/**
 * Generate human-readable rationale for the mediation decision
 */
export function generateRationale(
  path: MediationPath,
  source: MediationSourceEngine,
  context: {
    sdiValue?: number;
    confidence?: number;
    projectedImprovement?: number;
    explorationAllocation?: number;
  }
): string {
  switch (path) {
    case MediationPath.CRISIS_MODE:
      return `Crisis mode activated (SDI: ${context.sdiValue?.toFixed(0) || 'N/A'}). ` +
        `Using validated pattern with ${((context.confidence || 0) * 100).toFixed(0)}% confidence. ` +
        `No exploration permitted due to constrained solution space.`;

    case MediationPath.HIGH_CONFIDENCE_MATCH:
      return `High-confidence pattern match found (${((context.confidence || 0) * 100).toFixed(0)}%). ` +
        `Using proven pattern with minimal exploration budget. ` +
        `Decision based on ${context.sdiValue?.toFixed(0) || 'healthy'} SDI state.`;

    case MediationPath.PROMISING_EXPLORATION:
      return `Exploratory path selected. Engine 2 projects ${((context.projectedImprovement || 0) * 100).toFixed(0)}% improvement. ` +
        `Exploration allocation: ${((context.explorationAllocation || 0) * 100).toFixed(0)}%. ` +
        `Fallback pattern configured for monitoring.`;

    case MediationPath.NO_PATTERNS:
      return `No applicable patterns found in Success Stack. ` +
        `Decision escalated to higher authority or using lowest-risk option. ` +
        `Full exploration budget allocated due to no precedent.`;

    case MediationPath.DEFAULT_BLEND:
      return `Blended decision using ${((context.explorationAllocation || 0) * 100).toFixed(0)}% exploration allocation. ` +
        `Pattern confidence: ${((context.confidence || 0) * 100).toFixed(0)}%. ` +
        `Balancing proven patterns with moderate innovation.`;

    default:
      return `Mediation decision from ${source} engine.`;
  }
}

/**
 * Determine risk bearer for the decision
 */
function determineRiskBearer(
  source: MediationSourceEngine,
  actorId: string,
  hasNovelExploration: boolean
): string {
  // Exploratory decisions: actor bears risk
  if (source === MediationSourceEngine.ENGINE_2 || hasNovelExploration) {
    return actorId;
  }

  // Pattern-based decisions: system/organization bears risk
  return 'system';
}

// ============================================================================
// Main Mediation Function
// ============================================================================

/**
 * Perform full dual-process mediation
 *
 * @param input - Mediation input
 * @param config - Mediator configuration
 * @returns Mediation decision
 */
export async function mediateDecision(
  input: MediationInput,
  config: USFMediatorConfig = DEFAULT_MEDIATOR_CONFIG
): Promise<MediationDecision> {
  const startTime = performance.now();

  const {
    projectId,
    zoneId,
    trigger,
    actorId,
    components,
    engine1Output,
    engine2Output,
    forceEngine,
    dryRun = false,
  } = input;

  // Calculate SDI
  const sdiValue = computeSDIFromComponents(components);
  const sdiClassification = classifySDI(sdiValue, DEFAULT_THRESHOLDS);

  // Calculate exploration budget
  const baseBudget = calculateExplorationBudget({
    sdiValue,
    eigenmodeStability: components.eigenmodeStability,
    resourceSlackRatio: components.resourceSlackRatio,
  });

  // Adjust budget for context
  const adjustedBudget = adjustBudgetForContext(baseBudget.budget, {
    urgency: trigger.urgency,
    triggerType: trigger.type,
    deadline: trigger.deadline,
  });

  // Determine best Engine 2 option
  const engine2BestOption = engine2Output.viableOptions[0]
    ? {
        projectedSdi: engine2Output.viableOptions[0].projectedSdi,
        explorationValue: engine2Output.viableOptions[0].explorationValue,
        feasibilityScore: engine2Output.viableOptions[0].feasibilityScore,
      }
    : null;

  // Determine decision path
  let path: MediationPath;

  if (forceEngine === 'engine1') {
    path = MediationPath.HIGH_CONFIDENCE_MATCH;
  } else if (forceEngine === 'engine2') {
    path = MediationPath.PROMISING_EXPLORATION;
  } else {
    path = determineDecisionPath({
      sdiValue,
      sdiClassification,
      engine1Confidence: engine1Output.confidence,
      engine2BestOption,
      explorationBudget: adjustedBudget,
      hasApplicablePatterns: engine1Output.applicablePatterns.length > 0,
    }, config);
  }

  // Select action based on path
  const selection = selectAction(
    path,
    engine1Output,
    engine2Output,
    adjustedBudget,
    config
  );

  // Override source if forced
  let finalSource = selection.source;
  if (forceEngine === 'engine1') {
    finalSource = MediationSourceEngine.ENGINE_1;
  } else if (forceEngine === 'engine2') {
    finalSource = MediationSourceEngine.ENGINE_2;
  }

  // Generate decision event URN
  const decisionEventUrn = generateDecisionEventUrn(projectId, dryRun);

  // Create monitoring triggers if needed
  let monitoringTriggers: MonitoringTrigger[] = [];
  if (selection.requiresMonitoring && !dryRun) {
    monitoringTriggers = createStandardMonitoringTriggers(decisionEventUrn, sdiValue);
  }

  // Determine escalation target if escalating
  let escalationTarget: string | undefined;
  if (finalSource === MediationSourceEngine.ESCALATE) {
    escalationTarget = config.defaultEscalationTarget;
  }

  // Generate rationale
  const rationale = generateRationale(path, finalSource, {
    sdiValue,
    confidence: engine1Output.confidence,
    projectedImprovement: engine2BestOption
      ? (engine2BestOption.projectedSdi - sdiValue) / sdiValue
      : 0,
    explorationAllocation: selection.explorationAllocation,
  });

  // Determine risk bearer
  const hasNovelExploration = engine2Output.viableOptions.some((o) => o.isNovel);
  const riskBearer = determineRiskBearer(finalSource, actorId, hasNovelExploration);

  const mediationLatencyMs = performance.now() - startTime;

  return {
    decisionEventUrn,
    selectedAction: selection.action,
    sourceEngine: finalSource,
    rationale,
    explorationAllocation: selection.explorationAllocation,
    riskBearer,
    monitoringTriggers,
    fallbackAction: selection.fallbackAction,
    escalationTarget,
    engine1Output,
    engine2Output,
    mediationLatencyMs,
  };
}

// ============================================================================
// Service Export
// ============================================================================

/**
 * USF Mediator Service namespace
 */
export const USFMediatorService = {
  mediateDecision,
  determineDecisionPath,
  selectAction,
  createFallbackAction,
  generateRationale,
  resetMediationIdCounter,
  DEFAULT_MEDIATOR_CONFIG,
  MediationPath,
};

export default USFMediatorService;
