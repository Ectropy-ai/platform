/**
 * Admin Council Configuration
 *
 * Defines the governance structure for the Ectropy Admin Council.
 * The Admin Council is responsible for approving architectural decisions,
 * schema changes, and strategic direction of the platform.
 *
 * V3 Enterprise Standard (2026-01-08):
 * - URN-based member identification
 * - Authority levels aligned with PM Decision cascade
 * - Weighted voting support for governance decisions
 * - Quorum requirements for decision validity
 *
 * @module config/admin-council.config
 */

import type { URN } from '../services/data-source.interface.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Council member role enumeration
 */
export type CouncilRole =
  | 'CEO'
  | 'CTO'
  | 'ARCHITECT'
  | 'LEAD_ENGINEER'
  | 'AI_AGENT'
  | 'ADVISOR'
  | 'COMMUNITY_REP';

/**
 * Authority levels (aligned with PM Decision cascade)
 * Higher levels have more decision-making power
 */
export type AuthorityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Vote weight for governance decisions
 * Based on role and stake in the platform
 */
export type VoteWeight = 1 | 2 | 3;

/**
 * Council member definition
 */
export interface CouncilMember {
  /** URN identifier for the member */
  $id: URN;
  /** Human-readable user ID */
  userId: string;
  /** Display name */
  displayName: string;
  /** Council role */
  role: CouncilRole;
  /** Authority level (0-6) */
  authorityLevel: AuthorityLevel;
  /** Vote weight (1-3) */
  voteWeight: VoteWeight;
  /** Whether member is currently active */
  isActive: boolean;
  /** Email for notifications (optional) */
  email?: string;
  /** When member joined the council */
  joinedAt: string;
  /** Areas of expertise for routing decisions */
  expertise: string[];
}

/**
 * Quorum configuration for different vote types
 */
export interface QuorumConfig {
  /** Vote type identifier */
  voteType: 'simple-majority' | 'two-thirds-majority' | 'unanimous' | 'advisory';
  /** Minimum participation rate (0-1) */
  minParticipation: number;
  /** Threshold for approval (0-1 of participating votes) */
  approvalThreshold: number;
  /** Voting period in hours */
  votingPeriodHours: number;
  /** Whether abstentions count toward quorum */
  abstentionsCountForQuorum: boolean;
}

/**
 * Vote type configuration based on decision impact
 */
export interface VoteTypeConfig {
  /** Decision impact level */
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Required vote type */
  requiredVoteType: QuorumConfig['voteType'];
  /** Minimum authority level to propose */
  minProposerAuthority: AuthorityLevel;
  /** Categories of decisions at this level */
  categories: string[];
}

/**
 * Complete Admin Council configuration
 */
export interface AdminCouncilConfig {
  /** Schema identifier */
  $schema: string;
  /** URN for the council configuration */
  $id: URN;
  /** Schema version */
  schemaVersion: string;
  /** Last updated timestamp */
  lastUpdated: string;
  /** Council name */
  councilName: string;
  /** Council description */
  description: string;
  /** Council members */
  members: CouncilMember[];
  /** Quorum configurations */
  quorumConfigs: QuorumConfig[];
  /** Vote type configurations */
  voteTypeConfigs: VoteTypeConfig[];
  /** Default voting period in hours */
  defaultVotingPeriodHours: number;
  /** Whether to allow vote changes before closing */
  allowVoteChanges: boolean;
  /** Whether to require rationale with votes */
  requireRationale: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default Admin Council configuration for Ectropy
 */
export const ADMIN_COUNCIL_CONFIG: AdminCouncilConfig = {
  $schema: 'https://luhtech.dev/schemas/admin-council.schema.json',
  $id: 'urn:luhtech:ectropy:council:admin',
  schemaVersion: '1.0.0',
  lastUpdated: new Date().toISOString(),
  councilName: 'Ectropy Admin Council',
  description: 'Governance body for architectural decisions, schema changes, and strategic direction',

  members: [
    {
      $id: 'urn:luhtech:ectropy:person:erik',
      userId: 'erik',
      displayName: 'Erik',
      role: 'CEO',
      authorityLevel: 5,
      voteWeight: 2,
      isActive: true,
      joinedAt: '2025-07-01T00:00:00Z',
      expertise: ['strategy', 'architecture', 'business', 'governance'],
    },
    {
      $id: 'urn:luhtech:ectropy:person:seppa',
      userId: 'seppa',
      displayName: 'Seppä (AI Architect)',
      role: 'AI_AGENT',
      authorityLevel: 4,
      voteWeight: 1,
      isActive: true,
      joinedAt: '2026-01-01T00:00:00Z',
      expertise: ['architecture', 'code-review', 'schema-design', 'technical-analysis'],
    },
  ],

  quorumConfigs: [
    {
      voteType: 'simple-majority',
      minParticipation: 0.5,
      approvalThreshold: 0.5,
      votingPeriodHours: 72,
      abstentionsCountForQuorum: true,
    },
    {
      voteType: 'two-thirds-majority',
      minParticipation: 0.67,
      approvalThreshold: 0.67,
      votingPeriodHours: 168, // 1 week
      abstentionsCountForQuorum: false,
    },
    {
      voteType: 'unanimous',
      minParticipation: 1.0,
      approvalThreshold: 1.0,
      votingPeriodHours: 168,
      abstentionsCountForQuorum: false,
    },
    {
      voteType: 'advisory',
      minParticipation: 0.25,
      approvalThreshold: 0.0, // Advisory only, no approval threshold
      votingPeriodHours: 48,
      abstentionsCountForQuorum: true,
    },
  ],

  voteTypeConfigs: [
    {
      impactLevel: 'low',
      requiredVoteType: 'advisory',
      minProposerAuthority: 1,
      categories: ['documentation', 'minor-refactor', 'dependency-update'],
    },
    {
      impactLevel: 'medium',
      requiredVoteType: 'simple-majority',
      minProposerAuthority: 2,
      categories: ['feature', 'api-change', 'schema-modification'],
    },
    {
      impactLevel: 'high',
      requiredVoteType: 'two-thirds-majority',
      minProposerAuthority: 3,
      categories: ['breaking-change', 'security', 'architecture'],
    },
    {
      impactLevel: 'critical',
      requiredVoteType: 'unanimous',
      minProposerAuthority: 4,
      categories: ['core-architecture', 'governance', 'strategic-direction'],
    },
  ],

  defaultVotingPeriodHours: 72,
  allowVoteChanges: true,
  requireRationale: true,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get council member by user ID
 */
export function getCouncilMember(userId: string): CouncilMember | undefined {
  return ADMIN_COUNCIL_CONFIG.members.find(
    (m) => m.userId === userId && m.isActive
  );
}

/**
 * Get council member by URN
 */
export function getCouncilMemberByURN(urn: URN): CouncilMember | undefined {
  return ADMIN_COUNCIL_CONFIG.members.find(
    (m) => m.$id === urn && m.isActive
  );
}

/**
 * Get all active council members
 */
export function getActiveCouncilMembers(): CouncilMember[] {
  return ADMIN_COUNCIL_CONFIG.members.filter((m) => m.isActive);
}

/**
 * Get total vote weight for quorum calculations
 */
export function getTotalVoteWeight(): number {
  return getActiveCouncilMembers().reduce((sum, m) => sum + m.voteWeight, 0);
}

/**
 * Get quorum configuration by vote type
 */
export function getQuorumConfig(
  voteType: QuorumConfig['voteType']
): QuorumConfig | undefined {
  return ADMIN_COUNCIL_CONFIG.quorumConfigs.find((q) => q.voteType === voteType);
}

/**
 * Get vote type configuration by impact level
 */
export function getVoteTypeConfig(
  impactLevel: VoteTypeConfig['impactLevel']
): VoteTypeConfig | undefined {
  return ADMIN_COUNCIL_CONFIG.voteTypeConfigs.find(
    (v) => v.impactLevel === impactLevel
  );
}

/**
 * Determine required vote type based on decision category
 */
export function getRequiredVoteType(
  category: string
): QuorumConfig['voteType'] {
  for (const config of ADMIN_COUNCIL_CONFIG.voteTypeConfigs) {
    if (config.categories.includes(category)) {
      return config.requiredVoteType;
    }
  }
  // Default to simple majority for unknown categories
  return 'simple-majority';
}

/**
 * Check if a member can propose a vote at a given impact level
 */
export function canProposeVote(
  userId: string,
  impactLevel: VoteTypeConfig['impactLevel']
): boolean {
  const member = getCouncilMember(userId);
  if (!member) {return false;}

  const voteTypeConfig = getVoteTypeConfig(impactLevel);
  if (!voteTypeConfig) {return false;}

  return member.authorityLevel >= voteTypeConfig.minProposerAuthority;
}

/**
 * Calculate if quorum is met
 */
export function isQuorumMet(
  voteType: QuorumConfig['voteType'],
  participatingWeight: number,
  abstainWeight: number = 0
): boolean {
  const config = getQuorumConfig(voteType);
  if (!config) {return false;}

  const totalWeight = getTotalVoteWeight();
  const effectiveParticipation = config.abstentionsCountForQuorum
    ? participatingWeight + abstainWeight
    : participatingWeight;

  return effectiveParticipation / totalWeight >= config.minParticipation;
}

/**
 * Calculate if vote is approved
 */
export function isVoteApproved(
  voteType: QuorumConfig['voteType'],
  approveWeight: number,
  rejectWeight: number,
  abstainWeight: number = 0
): { approved: boolean; reason: string } {
  const config = getQuorumConfig(voteType);
  if (!config) {
    return { approved: false, reason: 'Invalid vote type' };
  }

  const totalParticipating = approveWeight + rejectWeight;
  const totalWithAbstain = totalParticipating + abstainWeight;
  const totalWeight = getTotalVoteWeight();

  // Check quorum first
  const effectiveParticipation = config.abstentionsCountForQuorum
    ? totalWithAbstain
    : totalParticipating;

  if (effectiveParticipation / totalWeight < config.minParticipation) {
    return {
      approved: false,
      reason: `Quorum not met: ${(effectiveParticipation / totalWeight * 100).toFixed(1)}% participation, ${(config.minParticipation * 100).toFixed(0)}% required`,
    };
  }

  // Check approval threshold
  if (totalParticipating === 0) {
    return { approved: false, reason: 'No votes cast (only abstentions)' };
  }

  const approvalRate = approveWeight / totalParticipating;

  if (approvalRate >= config.approvalThreshold) {
    return {
      approved: true,
      reason: `Approved: ${(approvalRate * 100).toFixed(1)}% approval (${(config.approvalThreshold * 100).toFixed(0)}% required)`,
    };
  } else {
    return {
      approved: false,
      reason: `Rejected: ${(approvalRate * 100).toFixed(1)}% approval (${(config.approvalThreshold * 100).toFixed(0)}% required)`,
    };
  }
}

/**
 * Get voting deadline based on vote type
 */
export function getVotingDeadline(voteType: QuorumConfig['voteType']): Date {
  const config = getQuorumConfig(voteType);
  const hours = config?.votingPeriodHours ?? ADMIN_COUNCIL_CONFIG.defaultVotingPeriodHours;
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + hours);
  return deadline;
}
