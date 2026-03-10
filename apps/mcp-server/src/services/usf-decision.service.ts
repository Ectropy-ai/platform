/**
 * USF Decision Service
 *
 * Phase 4: Decision Lifecycle Enhancement
 * Provides USF (Universal Service Factors) integration for the decision lifecycle:
 * - Projected USF impact calculation for new decisions
 * - Provider recommendations based on USF profiles
 * - USF-based authority escalation recommendations
 * - Decision context enrichment with USF data
 *
 * @see .roadmap/schemas/usf/usf-profile.schema.json
 * @see apps/mcp-server/src/services/pm-decision-tools.ts
 * @version 1.0.0
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DATA_CONFIG } from '../config/data-paths.config.js';

import type {
  PMURN,
  PMDecision,
  USFProfile,
  USFFactors,
  USFWeights,
  USFImpact,
  USFProviderType,
  USFPricingTier,
  USFProfilesCollection,
  AuthorityLevel,
} from '../types/pm.types.js';

import {
  calculateComposite,
  DEFAULT_USF_WEIGHTS,
  USF_PRICING_TIERS,
} from './usf.service.js';

import {
  calculateDecisionUSFImpact,
} from './usf-event-handler.service.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * USF thresholds for decision escalation
 */
export const USF_ESCALATION_THRESHOLDS = {
  /** Quality impact threshold requiring escalation */
  qualityImpactThreshold: -0.15,
  /** Cost impact threshold requiring escalation */
  costImpactThreshold: -0.20,
  /** Schedule impact threshold requiring escalation */
  scheduleImpactThreshold: -0.15,
  /** Composite impact threshold requiring escalation */
  compositeImpactThreshold: -0.12,
  /** Minimum provider quality for premium work */
  premiumQualityMinimum: 0.85,
  /** Minimum provider quality for standard work */
  standardQualityMinimum: 0.70,
};

/**
 * Authority level bump based on USF impact severity
 */
export const USF_AUTHORITY_BUMPS: Record<string, number> = {
  /** Minor USF impact - no authority bump */
  minor: 0,
  /** Moderate USF impact - bump authority by 1 */
  moderate: 1,
  /** Significant USF impact - bump authority by 2 */
  significant: 2,
  /** Critical USF impact - bump authority by 3 */
  critical: 3,
};

// ============================================================================
// Types
// ============================================================================

/**
 * USF impact severity classification
 */
export type USFImpactSeverity = 'minor' | 'moderate' | 'significant' | 'critical';

/**
 * Projected USF impact result
 */
export interface ProjectedUSFImpact {
  /** Calculated USF impact */
  impact: USFImpact;
  /** Impact severity classification */
  severity: USFImpactSeverity;
  /** Recommended authority bump */
  authorityBump: number;
  /** Risk factors identified */
  riskFactors: string[];
  /** Mitigation recommendations */
  mitigations: string[];
}

/**
 * Provider recommendation with USF scoring
 */
export interface USFProviderRecommendation {
  /** Provider URN */
  providerUrn: PMURN;
  /** Provider profile */
  profile: USFProfile;
  /** Match score (0-1) based on requirements */
  matchScore: number;
  /** Recommendation reason */
  reason: string;
  /** Pricing tier recommendation */
  recommendedTier: USFPricingTier;
  /** Estimated cost based on profile */
  estimatedCost?: number;
  /** Risk assessment */
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * USF-based escalation recommendation
 */
export interface USFEscalationRecommendation {
  /** Should escalate based on USF */
  shouldEscalate: boolean;
  /** Recommended authority level */
  recommendedAuthority: AuthorityLevel;
  /** Current authority level */
  currentAuthority: AuthorityLevel;
  /** Escalation reasons */
  reasons: string[];
  /** USF impact that triggered escalation */
  usfImpact: USFImpact;
}

/**
 * Decision requirements for provider matching
 */
export interface DecisionRequirements {
  /** Minimum quality score required */
  minQuality?: number;
  /** Maximum cost tolerance (budget factor) */
  maxCostFactor?: number;
  /** Minimum speed score required */
  minSpeed?: number;
  /** Required trade/specialty */
  trade?: string;
  /** Required provider types */
  providerTypes?: USFProviderType[];
  /** Pricing tier constraint */
  pricingTier?: USFPricingTier;
  /** Budget amount for estimation */
  budgetAmount?: number;
}

/**
 * USF decision context
 */
export interface USFDecisionContext {
  /** Decision being evaluated */
  decision: PMDecision;
  /** Projected USF impact */
  projectedImpact: ProjectedUSFImpact;
  /** Provider recommendations */
  providerRecommendations: USFProviderRecommendation[];
  /** Escalation recommendation */
  escalationRecommendation: USFEscalationRecommendation;
  /** Market benchmark for context */
  marketBenchmark?: USFFactors;
}

// ============================================================================
// Storage Helpers
// ============================================================================

function getRepoRoot(): string {
  return DATA_CONFIG.paths.repoRoot;
}

function getProjectDataDir(projectId: string): string {
  return join(getRepoRoot(), '.roadmap', 'projects', projectId);
}

function getUSFProfilesPath(projectId: string): string {
  return join(getProjectDataDir(projectId), 'usf-profiles.json');
}

function loadUSFProfiles(projectId: string): USFProfilesCollection | null {
  const path = getUSFProfilesPath(projectId);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculate projected USF impact from decision parameters
 *
 * Analyzes the decision's budget impact, schedule impact, and other factors
 * to project how it will affect USF scores if approved/rejected.
 */
export function calculateProjectedUSFImpact(decision: PMDecision): ProjectedUSFImpact {
  // Calculate base impact using the event handler function
  const baseImpact = calculateDecisionUSFImpact(decision);

  // Calculate composite
  const compositeImpact = calculateComposite({
    quality: Math.abs(baseImpact.qualityImpact),
    cost: Math.abs(baseImpact.costImpact),
    speed: Math.abs(baseImpact.scheduleImpact),
  });

  // Build full USF impact
  const impact: USFImpact = {
    qualityImpact: baseImpact.qualityImpact,
    costImpact: baseImpact.costImpact,
    scheduleImpact: baseImpact.scheduleImpact,
    compositeImpact: baseImpact.qualityImpact < 0 || baseImpact.costImpact < 0 || baseImpact.scheduleImpact < 0
      ? -compositeImpact
      : compositeImpact,
    impactReason: baseImpact.impactReason,
    calculatedAt: new Date().toISOString(),
  };

  // Classify severity
  const severity = classifyImpactSeverity(impact);

  // Determine authority bump
  const authorityBump = USF_AUTHORITY_BUMPS[severity];

  // Identify risk factors
  const riskFactors: string[] = [];
  if (impact.qualityImpact < USF_ESCALATION_THRESHOLDS.qualityImpactThreshold) {
    riskFactors.push(`Quality impact (${(impact.qualityImpact * 100).toFixed(1)}%) exceeds threshold`);
  }
  if (impact.costImpact < USF_ESCALATION_THRESHOLDS.costImpactThreshold) {
    riskFactors.push(`Cost impact (${(impact.costImpact * 100).toFixed(1)}%) exceeds threshold`);
  }
  if (impact.scheduleImpact < USF_ESCALATION_THRESHOLDS.scheduleImpactThreshold) {
    riskFactors.push(`Schedule impact (${(impact.scheduleImpact * 100).toFixed(1)}%) exceeds threshold`);
  }
  if (decision.scheduleImpact?.criticalPath) {
    riskFactors.push('Decision affects critical path');
  }

  // Generate mitigations
  const mitigations: string[] = [];
  if (riskFactors.length > 0) {
    if (impact.qualityImpact < -0.1) {
      mitigations.push('Consider additional QA inspection before approval');
      mitigations.push('Engage premium-tier provider for rework if needed');
    }
    if (impact.costImpact < -0.1) {
      mitigations.push('Review budget allocation with project controls');
      mitigations.push('Consider value engineering alternatives');
    }
    if (impact.scheduleImpact < -0.1) {
      mitigations.push('Evaluate schedule compression options');
      mitigations.push('Consider parallel work streams to recover time');
    }
  }

  return {
    impact,
    severity,
    authorityBump,
    riskFactors,
    mitigations,
  };
}

/**
 * Classify USF impact severity
 */
export function classifyImpactSeverity(impact: USFImpact): USFImpactSeverity {
  const absComposite = Math.abs(impact.compositeImpact);
  const absQuality = Math.abs(impact.qualityImpact);
  const absCost = Math.abs(impact.costImpact);
  const absSchedule = Math.abs(impact.scheduleImpact);

  // Critical: Any factor exceeds 25% or composite exceeds 20%
  if (absQuality > 0.25 || absCost > 0.25 || absSchedule > 0.25 || absComposite > 0.20) {
    return 'critical';
  }

  // Significant: Any factor exceeds 15% or composite exceeds 12%
  if (absQuality > 0.15 || absCost > 0.15 || absSchedule > 0.15 || absComposite > 0.12) {
    return 'significant';
  }

  // Moderate: Any factor exceeds 8% or composite exceeds 6%
  if (absQuality > 0.08 || absCost > 0.08 || absSchedule > 0.08 || absComposite > 0.06) {
    return 'moderate';
  }

  return 'minor';
}

/**
 * Get USF-based provider recommendations for a decision
 *
 * Searches available providers and ranks them based on how well
 * they match the decision requirements.
 */
export function getUSFProviderRecommendations(
  projectId: string,
  requirements: DecisionRequirements,
  limit: number = 5
): USFProviderRecommendation[] {
  const collection = loadUSFProfiles(projectId);
  if (!collection || collection.profiles.length === 0) {
    return [];
  }

  const recommendations: USFProviderRecommendation[] = [];

  for (const profile of collection.profiles) {
    // Filter by provider type if specified
    if (requirements.providerTypes && requirements.providerTypes.length > 0) {
      if (!requirements.providerTypes.includes(profile.providerType)) {
        continue;
      }
    }

    // Filter by trade if specified
    if (requirements.trade && profile.providerInfo?.trade !== requirements.trade) {
      continue;
    }

    // Filter by pricing tier if specified
    if (requirements.pricingTier && profile.pricingTier !== requirements.pricingTier) {
      continue;
    }

    // Calculate match score
    let matchScore = 0;
    const reasons: string[] = [];

    // Quality match (40% weight)
    const minQuality = requirements.minQuality || 0.7;
    if (profile.factors.quality >= minQuality) {
      const qualityBonus = Math.min((profile.factors.quality - minQuality) / 0.3, 1);
      matchScore += 0.4 * (0.5 + 0.5 * qualityBonus);
      reasons.push(`Quality ${(profile.factors.quality * 100).toFixed(0)}% meets requirement`);
    } else {
      matchScore += 0.4 * (profile.factors.quality / minQuality) * 0.5;
      reasons.push(`Quality ${(profile.factors.quality * 100).toFixed(0)}% below target`);
    }

    // Cost match (30% weight)
    const maxCostFactor = requirements.maxCostFactor || 1.0;
    // Higher cost score means better cost efficiency
    if (profile.factors.cost >= 0.7) {
      matchScore += 0.3 * profile.factors.cost;
      reasons.push(`Cost efficiency ${(profile.factors.cost * 100).toFixed(0)}%`);
    } else {
      matchScore += 0.3 * profile.factors.cost;
    }

    // Speed match (30% weight)
    const minSpeed = requirements.minSpeed || 0.6;
    if (profile.factors.speed >= minSpeed) {
      matchScore += 0.3 * profile.factors.speed;
      reasons.push(`Speed ${(profile.factors.speed * 100).toFixed(0)}% meets requirement`);
    } else {
      matchScore += 0.3 * (profile.factors.speed / minSpeed) * 0.5;
    }

    // Confidence bonus
    if (profile.confidence && profile.confidence.score > 0.8) {
      matchScore *= 1.05; // 5% bonus for high confidence
      reasons.push('High confidence profile');
    }

    // Determine recommended tier
    const recommendedTier = determineTierForProvider(profile);

    // Estimate cost if budget provided
    let estimatedCost: number | undefined;
    if (requirements.budgetAmount) {
      const tierMultiplier = USF_PRICING_TIERS[recommendedTier].costMultiplier;
      const reputationMultiplier = 0.8 + (profile.composite?.score || 0.7) * 0.4;
      estimatedCost = requirements.budgetAmount * tierMultiplier * reputationMultiplier;
    }

    // Risk assessment
    const riskLevel = assessProviderRisk(profile, requirements);

    recommendations.push({
      providerUrn: profile.$id,
      profile,
      matchScore: Math.min(matchScore, 1),
      reason: reasons.join('; '),
      recommendedTier,
      estimatedCost,
      riskLevel,
    });
  }

  // Sort by match score descending
  recommendations.sort((a, b) => b.matchScore - a.matchScore);

  return recommendations.slice(0, limit);
}

/**
 * Determine recommended pricing tier for a provider
 */
function determineTierForProvider(profile: USFProfile): USFPricingTier {
  const quality = profile.factors.quality;

  if (quality >= USF_PRICING_TIERS.premium.qualityMin) {
    return 'premium';
  } else if (quality >= USF_PRICING_TIERS.standard.qualityMin) {
    return 'standard';
  } else {
    return 'economy';
  }
}

/**
 * Assess provider risk level for given requirements
 */
function assessProviderRisk(
  profile: USFProfile,
  requirements: DecisionRequirements
): 'low' | 'medium' | 'high' {
  let riskScore = 0;

  // Quality risk
  const minQuality = requirements.minQuality || 0.7;
  if (profile.factors.quality < minQuality) {
    riskScore += 2;
  } else if (profile.factors.quality < minQuality + 0.1) {
    riskScore += 1;
  }

  // Confidence risk
  if (!profile.confidence || profile.confidence.score < 0.5) {
    riskScore += 2; // Low confidence is high risk
  } else if (profile.confidence.score < 0.7) {
    riskScore += 1;
  }

  // Variance risk
  if (profile.confidence && profile.confidence.variance > 0.2) {
    riskScore += 1; // High variance means inconsistent performance
  }

  // Sample size risk
  if (profile.confidence && profile.confidence.sampleSize < 5) {
    riskScore += 1; // Not enough data points
  }

  if (riskScore >= 4) {return 'high';}
  if (riskScore >= 2) {return 'medium';}
  return 'low';
}

/**
 * Determine if a decision should be escalated based on USF impact
 */
export function getUSFEscalationRecommendation(
  decision: PMDecision,
  currentAuthority: AuthorityLevel = 0
): USFEscalationRecommendation {
  const projectedImpact = calculateProjectedUSFImpact(decision);
  const impact = projectedImpact.impact;

  const shouldEscalate =
    projectedImpact.severity === 'critical' ||
    projectedImpact.severity === 'significant' ||
    impact.qualityImpact < USF_ESCALATION_THRESHOLDS.qualityImpactThreshold ||
    impact.costImpact < USF_ESCALATION_THRESHOLDS.costImpactThreshold ||
    impact.scheduleImpact < USF_ESCALATION_THRESHOLDS.scheduleImpactThreshold;

  const baseAuthority = decision.authorityLevel?.required || 0;
  const recommendedAuthority = Math.min(
    6,
    baseAuthority + projectedImpact.authorityBump
  ) as AuthorityLevel;

  const reasons: string[] = [];
  if (projectedImpact.severity === 'critical') {
    reasons.push('Critical USF impact severity');
  }
  if (projectedImpact.severity === 'significant') {
    reasons.push('Significant USF impact requires elevated review');
  }
  if (impact.qualityImpact < USF_ESCALATION_THRESHOLDS.qualityImpactThreshold) {
    reasons.push(`Quality impact ${(impact.qualityImpact * 100).toFixed(1)}% exceeds threshold`);
  }
  if (impact.costImpact < USF_ESCALATION_THRESHOLDS.costImpactThreshold) {
    reasons.push(`Cost impact ${(impact.costImpact * 100).toFixed(1)}% exceeds threshold`);
  }
  if (impact.scheduleImpact < USF_ESCALATION_THRESHOLDS.scheduleImpactThreshold) {
    reasons.push(`Schedule impact ${(impact.scheduleImpact * 100).toFixed(1)}% exceeds threshold`);
  }

  if (projectedImpact.riskFactors.length > 0) {
    reasons.push(...projectedImpact.riskFactors);
  }

  return {
    shouldEscalate,
    recommendedAuthority,
    currentAuthority,
    reasons,
    usfImpact: impact,
  };
}

/**
 * Get full USF decision context
 *
 * Combines projected impact, provider recommendations, and escalation
 * recommendations into a comprehensive decision context.
 */
export function getUSFDecisionContext(
  projectId: string,
  decision: PMDecision,
  requirements?: DecisionRequirements
): USFDecisionContext {
  // Calculate projected impact
  const projectedImpact = calculateProjectedUSFImpact(decision);

  // Get provider recommendations
  const defaultRequirements: DecisionRequirements = {
    minQuality: 0.75,
    budgetAmount: decision.budgetImpact?.estimated,
    ...requirements,
  };
  const providerRecommendations = getUSFProviderRecommendations(
    projectId,
    defaultRequirements,
    5
  );

  // Get escalation recommendation
  const escalationRecommendation = getUSFEscalationRecommendation(
    decision,
    decision.authorityLevel?.current
  );

  // Calculate market benchmark
  let marketBenchmark: USFFactors | undefined;
  const collection = loadUSFProfiles(projectId);
  if (collection && collection.profiles.length > 0) {
    const profiles = collection.profiles;
    marketBenchmark = {
      quality: profiles.reduce((sum, p) => sum + p.factors.quality, 0) / profiles.length,
      cost: profiles.reduce((sum, p) => sum + p.factors.cost, 0) / profiles.length,
      speed: profiles.reduce((sum, p) => sum + p.factors.speed, 0) / profiles.length,
    };
  }

  return {
    decision,
    projectedImpact,
    providerRecommendations,
    escalationRecommendation,
    marketBenchmark,
  };
}

/**
 * Calculate authority adjustment based on USF factors
 *
 * Returns the number of authority levels to add based on USF impact.
 */
export function calculateUSFAuthorityAdjustment(decision: PMDecision): {
  adjustment: number;
  reason: string;
} {
  const impact = calculateProjectedUSFImpact(decision);

  if (impact.severity === 'critical') {
    return {
      adjustment: 3,
      reason: 'Critical USF impact requires senior authority review',
    };
  }

  if (impact.severity === 'significant') {
    return {
      adjustment: 2,
      reason: 'Significant USF impact requires elevated authority',
    };
  }

  if (impact.severity === 'moderate') {
    return {
      adjustment: 1,
      reason: 'Moderate USF impact suggests additional oversight',
    };
  }

  return {
    adjustment: 0,
    reason: 'Minor USF impact - no authority adjustment needed',
  };
}

// ============================================================================
// Service Export
// ============================================================================

export const USFDecisionService = {
  // Constants
  USF_ESCALATION_THRESHOLDS,
  USF_AUTHORITY_BUMPS,

  // Core functions
  calculateProjectedUSFImpact,
  classifyImpactSeverity,
  getUSFProviderRecommendations,
  getUSFEscalationRecommendation,
  getUSFDecisionContext,
  calculateUSFAuthorityAdjustment,
};

export default USFDecisionService;
