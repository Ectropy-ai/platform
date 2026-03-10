/**
 * PM Authority Service
 *
 * Implements the 7-tier authority cascade for construction decision routing.
 * Calculates required authority level based on budget, schedule, variance,
 * safety, and design change factors.
 *
 * Authority Levels:
 * 0 - FIELD: $0 budget, 0 schedule, 0" variance
 * 1 - FOREMAN: $500 budget, 4 hours, 1/8" variance
 * 2 - SUPERINTENDENT: $5,000 budget, 1 day, 1/4" variance
 * 3 - PM: $50,000 budget, 1 week, 1/2" variance
 * 4 - ARCHITECT: design changes, 2 weeks, visible variance
 * 5 - OWNER: project scope, 1 month, major variance
 * 6 - REGULATORY: code/safety issues, any schedule, safety critical
 *
 * @see https://luhtech.dev/schemas/pm/authority-level.schema.json
 * @version 1.0.0
 */

import {
  AuthorityLevel,
  AUTHORITY_THRESHOLDS,
  type AuthorityThresholds,
  type PMDecision,
  type Participant,
  type PMURN,
  type FindDecisionAuthorityResult,
  type ValidateAuthorityResult,
} from '../types/pm.types.js';

// ============================================================================
// Schedule Constants (in hours)
// ============================================================================

const HOURS_IN_MONTH = 720; // ~30 days
const HOURS_IN_2_WEEKS = 336;
const HOURS_IN_WEEK = 168;
const HOURS_IN_DAY = 24;
const HOURS_FOREMAN = 4;

// ============================================================================
// Authority Level Calculator
// ============================================================================

/**
 * Parameters for calculating required authority
 */
export interface AuthorityCalculationParams {
  budgetImpact?: number;
  scheduleImpactHours?: number;
  varianceInches?: number;
  isSafetyIssue?: boolean;
  isDesignChange?: boolean;
}

/**
 * Calculate required authority level for a decision
 *
 * @param params - Decision impact parameters
 * @returns Required authority level (0-6)
 *
 * @example
 * calculateRequiredAuthority({ budgetImpact: 3000, scheduleImpactHours: 8 })
 * // Returns AuthorityLevel.SUPERINTENDENT (2)
 */
export function calculateRequiredAuthority(
  params: AuthorityCalculationParams
): AuthorityLevel {
  const {
    budgetImpact = 0,
    scheduleImpactHours = 0,
    varianceInches = 0,
    isSafetyIssue = false,
    isDesignChange = false,
  } = params;

  // Safety issues always require regulatory authority
  if (isSafetyIssue) {
    return AuthorityLevel.REGULATORY;
  }

  // Design changes require architect authority at minimum
  if (isDesignChange) {
    return AuthorityLevel.ARCHITECT;
  }

  let level: AuthorityLevel = AuthorityLevel.FIELD;

  // Budget escalation
  if (budgetImpact > 50000) {
    level = Math.max(level, AuthorityLevel.OWNER);
  } else if (budgetImpact > 5000) {
    level = Math.max(level, AuthorityLevel.PM);
  } else if (budgetImpact > 500) {
    level = Math.max(level, AuthorityLevel.SUPERINTENDENT);
  } else if (budgetImpact > 0) {
    level = Math.max(level, AuthorityLevel.FOREMAN);
  }

  // Schedule escalation (in hours)
  if (scheduleImpactHours > HOURS_IN_MONTH) {
    level = Math.max(level, AuthorityLevel.OWNER);
  } else if (scheduleImpactHours > HOURS_IN_2_WEEKS) {
    level = Math.max(level, AuthorityLevel.ARCHITECT);
  } else if (scheduleImpactHours > HOURS_IN_WEEK) {
    level = Math.max(level, AuthorityLevel.PM);
  } else if (scheduleImpactHours > HOURS_IN_DAY) {
    level = Math.max(level, AuthorityLevel.SUPERINTENDENT);
  } else if (scheduleImpactHours > HOURS_FOREMAN) {
    level = Math.max(level, AuthorityLevel.FOREMAN);
  }

  // Variance escalation (in inches)
  if (varianceInches > 0.5) {
    level = Math.max(level, AuthorityLevel.ARCHITECT);
  } else if (varianceInches > 0.25) {
    level = Math.max(level, AuthorityLevel.PM);
  } else if (varianceInches > 0.125) {
    level = Math.max(level, AuthorityLevel.SUPERINTENDENT);
  } else if (varianceInches > 0) {
    level = Math.max(level, AuthorityLevel.FOREMAN);
  }

  return level;
}

/**
 * Calculate authority from a decision's stored impacts
 */
export function calculateAuthorityFromDecision(
  decision: PMDecision
): AuthorityLevel {
  return calculateRequiredAuthority({
    budgetImpact: decision.budgetImpact?.estimated,
    scheduleImpactHours: decision.scheduleImpact?.delayDays
      ? decision.scheduleImpact.delayDays * 24
      : undefined,
  });
}

// ============================================================================
// Authority Validation
// ============================================================================

/**
 * Check if a participant has sufficient authority to approve a decision
 *
 * @param participantLevel - Participant's authority level
 * @param requiredLevel - Required authority level for decision
 * @returns true if participant can approve
 */
export function hasAuthority(
  participantLevel: AuthorityLevel,
  requiredLevel: AuthorityLevel
): boolean {
  return participantLevel >= requiredLevel;
}

/**
 * Validate a user can perform an action requiring specific authority
 *
 * @param participant - Participant attempting action
 * @param requiredLevel - Required authority level
 * @returns Validation result with details
 */
export function validateAuthority(
  participant: Participant,
  requiredLevel: AuthorityLevel
): ValidateAuthorityResult {
  const participantLevel = participant.authorityLevel;
  const gap = requiredLevel - participantLevel;

  if (hasAuthority(participantLevel, requiredLevel)) {
    return {
      canApprove: true,
      participantLevel,
      requiredLevel,
      gap: 0,
      escalationRequired: false,
    };
  }

  return {
    canApprove: false,
    participantLevel,
    requiredLevel,
    gap,
    escalationRequired: true,
  };
}

/**
 * Validate authority by level numbers directly
 */
export function validateAuthorityLevel(
  participantLevel: AuthorityLevel,
  requiredLevel: AuthorityLevel
): ValidateAuthorityResult {
  const gap = requiredLevel - participantLevel;

  if (hasAuthority(participantLevel, requiredLevel)) {
    return {
      canApprove: true,
      participantLevel,
      requiredLevel,
      gap: 0,
      escalationRequired: false,
    };
  }

  return {
    canApprove: false,
    participantLevel,
    requiredLevel,
    gap,
    escalationRequired: true,
  };
}

// ============================================================================
// Authority Graph
// ============================================================================

/**
 * Get the authority cascade (chain of command) for a project
 *
 * @returns Array of authority levels with their thresholds
 */
export function getAuthorityCascade(): AuthorityThresholds[] {
  return [...AUTHORITY_THRESHOLDS];
}

/**
 * Get threshold information for a specific authority level
 */
export function getAuthorityThreshold(
  level: AuthorityLevel
): AuthorityThresholds {
  return AUTHORITY_THRESHOLDS[level];
}

/**
 * Get authority level name
 */
export function getAuthorityName(level: AuthorityLevel): string {
  return AuthorityLevel[level];
}

/**
 * Get authority level title (human-readable)
 */
export function getAuthorityTitle(level: AuthorityLevel): string {
  return AUTHORITY_THRESHOLDS[level].title;
}

/**
 * Get the next higher authority level
 *
 * @returns Next level or null if at highest
 */
export function getNextAuthority(level: AuthorityLevel): AuthorityLevel | null {
  if (level >= AuthorityLevel.REGULATORY) {
    return null; // Already at highest level
  }
  return (level + 1) as AuthorityLevel;
}

/**
 * Get the previous lower authority level
 *
 * @returns Previous level or null if at lowest
 */
export function getPreviousAuthority(
  level: AuthorityLevel
): AuthorityLevel | null {
  if (level <= AuthorityLevel.FIELD) {
    return null; // Already at lowest level
  }
  return (level - 1) as AuthorityLevel;
}

/**
 * Get all authority levels that can approve at a given level
 */
export function getApprovalChain(
  requiredLevel: AuthorityLevel
): AuthorityLevel[] {
  const chain: AuthorityLevel[] = [];
  for (let level = requiredLevel; level <= AuthorityLevel.REGULATORY; level++) {
    chain.push(level);
  }
  return chain;
}

/**
 * Get authority level from string name
 */
export function parseAuthorityLevel(name: string): AuthorityLevel | null {
  const upperName = name.toUpperCase();
  const level = AuthorityLevel[upperName as keyof typeof AuthorityLevel];
  return typeof level === 'number' ? level : null;
}

// ============================================================================
// Decision Routing
// ============================================================================

/**
 * Routing decision result
 */
export interface RoutingResult {
  shouldEscalate: boolean;
  targetLevel: AuthorityLevel;
  reason: string;
}

/**
 * Route a decision to appropriate authority
 *
 * @param decision - Decision to route
 * @param currentLevel - Current authority level of the decision
 * @returns Routing information
 */
export function routeDecision(
  decision: PMDecision,
  currentLevel: AuthorityLevel
): RoutingResult {
  const requiredLevel = decision.authorityLevel.required;

  if (currentLevel >= requiredLevel) {
    return {
      shouldEscalate: false,
      targetLevel: currentLevel,
      reason: 'Decision can be approved at current level',
    };
  }

  const budgetStr = decision.budgetImpact?.estimated
    ? `$${decision.budgetImpact.estimated.toLocaleString()}`
    : 'N/A';
  const scheduleStr = decision.scheduleImpact?.delayDays
    ? `${decision.scheduleImpact.delayDays} days`
    : 'N/A';

  return {
    shouldEscalate: true,
    targetLevel: requiredLevel,
    reason: `Decision requires ${AuthorityLevel[requiredLevel]} authority (budget: ${budgetStr}, schedule: ${scheduleStr})`,
  };
}

/**
 * Find the decision authority for given impacts
 *
 * @param params - Impact parameters
 * @returns Authority level name and threshold info
 */
export function findDecisionAuthority(
  params: AuthorityCalculationParams
): FindDecisionAuthorityResult {
  const level = calculateRequiredAuthority(params);
  const threshold = getAuthorityThreshold(level);

  // Build triggering factors
  const triggeringFactors: string[] = [];
  if (params.isSafetyIssue) {
    triggeringFactors.push('Safety issue - requires regulatory authority');
  }
  if (params.isDesignChange) {
    triggeringFactors.push('Design change - requires architect authority');
  }
  if (params.budgetImpact && params.budgetImpact > 0) {
    triggeringFactors.push(
      `Budget impact: ${params.budgetImpact.toLocaleString()}`
    );
  }
  if (params.scheduleImpactHours && params.scheduleImpactHours > 0) {
    triggeringFactors.push(
      `Schedule impact: ${params.scheduleImpactHours} hours`
    );
  }
  if (params.varianceInches && params.varianceInches > 0) {
    triggeringFactors.push(`Variance: ${params.varianceInches}"`);
  }

  // Build escalation path as AuthorityThresholds[]
  const escalationPath: AuthorityThresholds[] = [];
  for (let l = AuthorityLevel.FIELD; l <= level; l++) {
    escalationPath.push(AUTHORITY_THRESHOLDS[l]);
  }

  return {
    requiredLevel: level,
    requiredName: AuthorityLevel[level],
    triggeringFactors,
    escalationPath,
  };
}

/**
 * Determine if a decision should auto-approve at field level
 */
export function shouldAutoApprove(params: AuthorityCalculationParams): boolean {
  const level = calculateRequiredAuthority(params);
  return level === AuthorityLevel.FIELD;
}

// ============================================================================
// Authority URN Helpers
// ============================================================================

/**
 * Build URN for authority level
 */
export function buildAuthorityURN(
  ventureId: string,
  level: AuthorityLevel
): PMURN {
  return `urn:luhtech:${ventureId}:authority-level:pm-level-${level}` as PMURN;
}

/**
 * Parse authority level from URN
 */
export function parseAuthorityURN(urn: string): AuthorityLevel | null {
  const match = urn.match(/pm-level-(\d)$/);
  if (!match) {
    return null;
  }

  const level = parseInt(match[1], 10);
  if (level < 0 || level > 6) {
    return null;
  }

  return level as AuthorityLevel;
}

// ============================================================================
// Budget/Schedule Helpers
// ============================================================================

/**
 * Convert schedule days to hours
 */
export function daysToHours(days: number): number {
  return days * 24;
}

/**
 * Convert schedule hours to days
 */
export function hoursToDays(hours: number): number {
  return Math.ceil(hours / 24);
}

/**
 * Get budget threshold for an authority level
 */
export function getBudgetThreshold(level: AuthorityLevel): number {
  switch (level) {
    case AuthorityLevel.FIELD:
      return 0;
    case AuthorityLevel.FOREMAN:
      return 500;
    case AuthorityLevel.SUPERINTENDENT:
      return 5000;
    case AuthorityLevel.PM:
      return 50000;
    default:
      return Infinity;
  }
}

/**
 * Get schedule threshold (in hours) for an authority level
 */
export function getScheduleThreshold(level: AuthorityLevel): number {
  switch (level) {
    case AuthorityLevel.FIELD:
      return 0;
    case AuthorityLevel.FOREMAN:
      return HOURS_FOREMAN;
    case AuthorityLevel.SUPERINTENDENT:
      return HOURS_IN_DAY;
    case AuthorityLevel.PM:
      return HOURS_IN_WEEK;
    case AuthorityLevel.ARCHITECT:
      return HOURS_IN_2_WEEKS;
    case AuthorityLevel.OWNER:
      return HOURS_IN_MONTH;
    default:
      return Infinity;
  }
}

/**
 * Get variance threshold (in inches) for an authority level
 */
export function getVarianceThreshold(level: AuthorityLevel): number {
  switch (level) {
    case AuthorityLevel.FIELD:
      return 0;
    case AuthorityLevel.FOREMAN:
      return 0.125; // 1/8"
    case AuthorityLevel.SUPERINTENDENT:
      return 0.25; // 1/4"
    case AuthorityLevel.PM:
      return 0.5; // 1/2"
    default:
      return Infinity;
  }
}

// ============================================================================
// Service Export
// ============================================================================

export const PMAuthorityService = {
  // Calculation
  calculateRequiredAuthority,
  calculateAuthorityFromDecision,

  // Validation
  hasAuthority,
  validateAuthority,
  validateAuthorityLevel,

  // Graph/Cascade
  getAuthorityCascade,
  getAuthorityThreshold,
  getAuthorityName,
  getAuthorityTitle,
  getNextAuthority,
  getPreviousAuthority,
  getApprovalChain,
  parseAuthorityLevel,

  // Routing
  routeDecision,
  findDecisionAuthority,
  shouldAutoApprove,

  // URN
  buildAuthorityURN,
  parseAuthorityURN,

  // Thresholds
  daysToHours,
  hoursToDays,
  getBudgetThreshold,
  getScheduleThreshold,
  getVarianceThreshold,
};

export default PMAuthorityService;
