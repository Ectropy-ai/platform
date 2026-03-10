/**
 * Platform Context Service
 *
 * Manages context injection for Platform Agent MCP tool calls.
 * Ensures complete isolation from tenant data by injecting platform-only
 * context into every tool invocation.
 *
 * Key responsibilities:
 * 1. Inject platform context into tool calls
 * 2. Validate tool availability for platform agent
 * 3. Enforce authority cascade
 * 4. Filter Success Stack to platform tier only
 *
 * @see .roadmap/features/platform-agent/FEATURE.json
 * @version 1.0.0
 */

import {
  PLATFORM_AGENT_CONFIG,
  PlatformAgentContext,
  PlatformAuthorityLevel,
  isToolAvailableForPlatform,
  getRequiredAuthorityLevel,
  hasAuthorityForDecision,
  createPlatformContext,
  PLATFORM_EIGENMODE_LABELS,
  PLATFORM_DATA_FILES,
} from '../config/platform-agent.config.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of context validation
 */
export interface ContextValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Tool call with platform context
 */
export interface PlatformToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  context: PlatformAgentContext;
}

/**
 * Authority check result
 */
export interface AuthorityCheckResult {
  authorized: boolean;
  requiredLevel: PlatformAuthorityLevel;
  currentLevel: PlatformAuthorityLevel;
  escalationRequired: boolean;
  escalationTarget?: string;
  reason?: string;
}

/**
 * Platform context state (singleton)
 */
interface PlatformContextState {
  initialized: boolean;
  currentContext: PlatformAgentContext | null;
  sessionId: string | null;
  decisionHistory: string[];
}

// ============================================================================
// State
// ============================================================================

const state: PlatformContextState = {
  initialized: false,
  currentContext: null,
  sessionId: null,
  decisionHistory: [],
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize platform context service
 */
export function initializePlatformContext(
  actorId: string,
  actorLevel: PlatformAuthorityLevel = PlatformAuthorityLevel.CLAUDE_AGENT,
  sessionId?: string
): PlatformAgentContext {
  const context = createPlatformContext(actorId, actorLevel);

  state.initialized = true;
  state.currentContext = context;
  state.sessionId = sessionId || `platform-session-${Date.now()}`;
  state.decisionHistory = [];

  return context;
}

/**
 * Get current platform context
 */
export function getCurrentPlatformContext(): PlatformAgentContext | null {
  return state.currentContext;
}

/**
 * Check if platform context is initialized
 */
export function isPlatformContextInitialized(): boolean {
  return state.initialized && state.currentContext !== null;
}

/**
 * Reset platform context (for testing)
 */
export function resetPlatformContext(): void {
  state.initialized = false;
  state.currentContext = null;
  state.sessionId = null;
  state.decisionHistory = [];
}

// ============================================================================
// Tool Validation
// ============================================================================

/**
 * Validate tool call for platform agent
 */
export function validatePlatformToolCall(
  toolName: string,
  args: Record<string, unknown>
): ContextValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if tool is available for platform
  if (!isToolAvailableForPlatform(toolName)) {
    errors.push(`Tool '${toolName}' is not available for Platform Agent`);
  }

  // Check for tenant-scoped arguments
  if (args.tenantId && args.tenantId !== null) {
    errors.push('Platform Agent cannot specify tenantId - must be null');
  }

  if (args.projectId && !String(args.projectId).startsWith('ectropy-')) {
    warnings.push(
      `projectId '${args.projectId}' does not start with 'ectropy-' - ensure this is a platform project`
    );
  }

  // Check for excluded context references
  const excludedContexts = PLATFORM_AGENT_CONFIG.contextInjection.excludedContexts;
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      for (const excluded of excludedContexts) {
        if (value.toLowerCase().includes(excluded.toLowerCase())) {
          errors.push(`Argument '${key}' references excluded context '${excluded}'`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Inject platform context into tool arguments
 */
export function injectPlatformContext(
  toolName: string,
  args: Record<string, unknown>
): PlatformToolCall {
  if (!state.currentContext) {
    throw new Error('Platform context not initialized. Call initializePlatformContext first.');
  }

  // Validate the call
  const validation = validatePlatformToolCall(toolName, args);
  if (!validation.valid) {
    throw new Error(`Invalid platform tool call: ${validation.errors.join(', ')}`);
  }

  // Inject platform-specific arguments
  const enrichedArgs: Record<string, unknown> = {
    ...args,
    _platformContext: {
      agentType: 'PLATFORM',
      tenantId: null,
      successStackTier: 'platform',
      excludedContexts: PLATFORM_AGENT_CONFIG.contextInjection.excludedContexts,
      sessionId: state.sessionId,
    },
  };

  // For Success Stack queries, ensure tier is platform-only
  if (toolName === 'query_success_stack') {
    enrichedArgs.tier = 'platform';
    enrichedArgs.excludeGlobal = true;
    enrichedArgs.excludeTenant = true;
  }

  // For pattern storage, mark as platform pattern
  if (toolName === 'store_success_pattern' || toolName === 'compress_decision_pattern') {
    enrichedArgs.tier = 'platform';
    enrichedArgs.isGlobal = false;
  }

  // For SDI calculations, use platform eigenmodes
  if (toolName === 'calculate_sdi' || toolName === 'calculate_health_score') {
    enrichedArgs.eigenmodeLabels = PLATFORM_EIGENMODE_LABELS;
  }

  return {
    toolName,
    arguments: enrichedArgs,
    context: state.currentContext,
  };
}

// ============================================================================
// Authority Management
// ============================================================================

/**
 * Check if current actor has authority for a decision
 */
export function checkAuthorityForDecision(
  effortHours: number,
  scope: 'single_file' | 'single_feature' | 'multi_feature' | 'strategic',
  patternConfidence?: number
): AuthorityCheckResult {
  if (!state.currentContext) {
    throw new Error('Platform context not initialized');
  }

  const currentLevel = state.currentContext.authorityContext.currentLevel;
  const requiredLevel = getRequiredAuthorityLevel(effortHours);

  // Check scope requirements
  const scopeOrder = ['single_file', 'single_feature', 'multi_feature', 'strategic'];
  const currentScopeIndex = scopeOrder.indexOf(
    PLATFORM_AGENT_CONFIG.authorityLevels[currentLevel].scopeLimit
  );
  const requiredScopeIndex = scopeOrder.indexOf(scope);

  const scopeAuthorized = currentScopeIndex >= requiredScopeIndex;

  // Check pattern confidence requirements
  const confidenceRequired =
    PLATFORM_AGENT_CONFIG.authorityLevels[currentLevel].patternConfidenceRequired;
  const confidenceAuthorized =
    patternConfidence === undefined || patternConfidence >= confidenceRequired;

  const authorized =
    hasAuthorityForDecision(currentLevel, requiredLevel) &&
    scopeAuthorized &&
    confidenceAuthorized;

  let escalationTarget: string | undefined;
  let reason: string | undefined;

  if (!authorized) {
    // Determine escalation target
    const nextLevel = Math.min(currentLevel + 1, PlatformAuthorityLevel.ERIK);
    escalationTarget = PLATFORM_AGENT_CONFIG.authorityLevels[nextLevel].role;

    if (!hasAuthorityForDecision(currentLevel, requiredLevel)) {
      reason = `Effort ${effortHours}h exceeds authority limit`;
    } else if (!scopeAuthorized) {
      reason = `Scope '${scope}' exceeds authority limit '${PLATFORM_AGENT_CONFIG.authorityLevels[currentLevel].scopeLimit}'`;
    } else if (!confidenceAuthorized) {
      reason = `Pattern confidence ${patternConfidence} below required ${confidenceRequired}`;
    }
  }

  return {
    authorized,
    requiredLevel,
    currentLevel,
    escalationRequired: !authorized,
    escalationTarget,
    reason,
  };
}

/**
 * Escalate to higher authority level
 */
export function escalateAuthority(
  targetLevel: PlatformAuthorityLevel,
  reason: string
): void {
  if (!state.currentContext) {
    throw new Error('Platform context not initialized');
  }

  if (targetLevel <= state.currentContext.authorityContext.currentLevel) {
    throw new Error('Cannot escalate to same or lower authority level');
  }

  // Log escalation in decision history
  state.decisionHistory.push(
    `ESCALATION: ${state.currentContext.authorityContext.currentActor} → ` +
    `${PLATFORM_AGENT_CONFIG.authorityLevels[targetLevel].role}: ${reason}`
  );

  // Update context (in real implementation, this would await approval)
  state.currentContext = {
    ...state.currentContext,
    authorityContext: {
      ...state.currentContext.authorityContext,
      currentLevel: targetLevel,
    },
  };
}

// ============================================================================
// Decision Tracking
// ============================================================================

/**
 * Record a platform decision
 */
export function recordPlatformDecision(decisionUrn: string): void {
  state.decisionHistory.push(decisionUrn);
}

/**
 * Get decision history for current session
 */
export function getDecisionHistory(): string[] {
  return [...state.decisionHistory];
}

/**
 * Get session ID
 */
export function getSessionId(): string | null {
  return state.sessionId;
}

// ============================================================================
// Data File Access
// ============================================================================

/**
 * Get platform data file path
 */
export function getPlatformDataFilePath(
  fileType: keyof typeof PLATFORM_DATA_FILES
): string {
  return PLATFORM_DATA_FILES[fileType];
}

/**
 * Get all platform data file paths
 */
export function getAllPlatformDataFilePaths(): typeof PLATFORM_DATA_FILES {
  return { ...PLATFORM_DATA_FILES };
}

// ============================================================================
// Eigenmode Helpers
// ============================================================================

/**
 * Get platform eigenmode labels
 */
export function getPlatformEigenmodeLabels(): string[] {
  return [...PLATFORM_EIGENMODE_LABELS];
}

/**
 * Create eigenmode vector with labels
 */
export function createLabeledEigenmodeVector(
  values: number[]
): Array<{ index: number; label: string; value: number }> {
  if (values.length !== 12) {
    throw new Error(`Eigenmode vector must have 12 values, got ${values.length}`);
  }

  return PLATFORM_EIGENMODE_LABELS.map((label, index) => ({
    index,
    label,
    value: values[index],
  }));
}

// ============================================================================
// Exports
// ============================================================================

export {
  PlatformAuthorityLevel,
  PLATFORM_AGENT_CONFIG,
  PLATFORM_EIGENMODE_LABELS,
  PLATFORM_DATA_FILES,
};

export default {
  initializePlatformContext,
  getCurrentPlatformContext,
  isPlatformContextInitialized,
  resetPlatformContext,
  validatePlatformToolCall,
  injectPlatformContext,
  checkAuthorityForDecision,
  escalateAuthority,
  recordPlatformDecision,
  getDecisionHistory,
  getSessionId,
  getPlatformDataFilePath,
  getAllPlatformDataFilePaths,
  getPlatformEigenmodeLabels,
  createLabeledEigenmodeVector,
};
