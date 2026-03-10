/**
 * Platform Authority Configuration
 *
 * Defines the 4-tier platform development authority cascade.
 * This is the governance hierarchy for Ectropy's internal development decisions.
 *
 * Authority Levels:
 * 0. CLAUDE_AGENT — Automated decisions within strict boundaries
 * 1. DEVELOPER    — Human developer decisions for single features
 * 2. ARCHITECT    — Multi-feature architectural decisions
 * 3. ERIK         — Strategic, unlimited-scope decisions
 *
 * @module adapters/platform
 * @version 1.0.0
 */

import type {
  DomainContext,
  IAuthorityLevel,
  IAuthorityCascade,
} from '../universal/universal.types.js';

// ============================================================================
// Platform Authority Levels
// ============================================================================

export const PLATFORM_AUTHORITY_LEVELS: IAuthorityLevel[] = [
  {
    tier: 0,
    id: 'claude-agent',
    title: 'Claude Agent',
    budgetLimit: 0, // No budget authority
    timeAuthorityHours: 4,
    scopeDescription: 'Single file changes, documentation updates, test fixes',
    canAutoApprove: true,
    permissions: [
      'READ_STATE',
      'QUERY_DECISIONS',
      'PROPOSE_CHANGE',
      'RUN_TESTS',
      'CREATE_PR',
    ],
  },
  {
    tier: 1,
    id: 'developer',
    title: 'Developer',
    budgetLimit: 0, // No direct budget authority
    timeAuthorityHours: 40,
    scopeDescription: 'Single feature implementation, bug fixes, refactoring',
    canAutoApprove: false,
    permissions: [
      'READ_STATE',
      'QUERY_DECISIONS',
      'PROPOSE_CHANGE',
      'RUN_TESTS',
      'CREATE_PR',
      'APPROVE_AGENT_PR',
      'MODIFY_FEATURE',
    ],
  },
  {
    tier: 2,
    id: 'architect',
    title: 'Architect',
    budgetLimit: 10000, // Infrastructure spend authority
    timeAuthorityHours: 200,
    scopeDescription:
      'Multi-feature changes, architectural decisions, dependency upgrades',
    canAutoApprove: false,
    permissions: [
      'READ_STATE',
      'QUERY_DECISIONS',
      'PROPOSE_CHANGE',
      'RUN_TESTS',
      'CREATE_PR',
      'APPROVE_AGENT_PR',
      'MODIFY_FEATURE',
      'APPROVE_ARCHITECTURE',
      'MODIFY_DEPENDENCIES',
      'MODIFY_INFRASTRUCTURE',
    ],
  },
  {
    tier: 3,
    id: 'erik',
    title: 'Erik (Founder)',
    budgetLimit: Infinity, // Unlimited
    timeAuthorityHours: Infinity, // Unlimited
    scopeDescription:
      'Strategic decisions, pivots, resource allocation, venture direction',
    canAutoApprove: true,
    permissions: [
      'READ_STATE',
      'QUERY_DECISIONS',
      'PROPOSE_CHANGE',
      'RUN_TESTS',
      'CREATE_PR',
      'APPROVE_AGENT_PR',
      'MODIFY_FEATURE',
      'APPROVE_ARCHITECTURE',
      'MODIFY_DEPENDENCIES',
      'MODIFY_INFRASTRUCTURE',
      'STRATEGIC_PIVOT',
      'RESOURCE_ALLOCATION',
      'VENTURE_DIRECTION',
    ],
  },
];

/**
 * Escalation timeouts for the platform authority cascade.
 * Maps authority level ID to hours before auto-escalation.
 */
export const PLATFORM_ESCALATION_TIMEOUTS: Record<string, number> = {
  'claude-agent': 1, // 1 hour — agent decisions are fast
  developer: 8, // 1 business day
  architect: 24, // 1 day
  erik: Infinity, // No auto-escalation from top level
};

/**
 * Build the complete platform authority cascade.
 */
export function createPlatformAuthorityCascade(
  domain: DomainContext
): IAuthorityCascade {
  return {
    domain,
    levels: PLATFORM_AUTHORITY_LEVELS,
    escalationTimeouts: PLATFORM_ESCALATION_TIMEOUTS,
  };
}
