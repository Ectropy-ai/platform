/**
 * USF (Universal Service Factors) Service
 *
 * Implements the normalization formulas and calculations for USF metrics.
 * Enables equivalent comparison of heterogeneous service providers
 * (humans, agents, robots, teams, subcontractors) using normalized
 * Quality/Cost/Speed on 0.0-1.0 scales.
 *
 * @see .roadmap/schemas/usf/usf-profile.schema.json
 * @see .roadmap/schemas/usf/usf-work-packet.schema.json
 * @version 1.0.0
 */

import type {
  USFFactors,
  USFWeights,
  USFConfidence,
  USFPricingTier,
  USFProviderType,
} from '../types/pm.types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default weights for composite score calculation
 */
export const DEFAULT_USF_WEIGHTS: USFWeights = {
  quality: 0.4,
  cost: 0.3,
  speed: 0.3,
};

/**
 * Pricing tier configurations
 */
export const USF_PRICING_TIERS: Record<
  USFPricingTier,
  { qualityMin: number; costMultiplier: number }
> = {
  economy: { qualityMin: 0.6, costMultiplier: 0.8 },
  standard: { qualityMin: 0.75, costMultiplier: 1.0 },
  premium: { qualityMin: 0.85, costMultiplier: 1.3 },
  expedited: { qualityMin: 0.8, costMultiplier: 1.8 },
};

// ============================================================================
// Quality Score Calculation
// ============================================================================

export interface QualityMetrics {
  firstPassYield: number; // 0-1, primary indicator
  defectCount: number;
  reworkHours: number;
  plannedHours: number;
  compliancePassed?: boolean;
}

/**
 * Calculate quality score from metrics
 *
 * Formula:
 * - Base: First-pass yield (0-1)
 * - Defect penalty: min(defectCount * 0.05, 0.3)
 * - Rework penalty: min((reworkHours/plannedHours) * 0.5, 0.3)
 * - Compliance bonus: +0.05 if passed
 *
 * @param metrics - Quality measurement inputs
 * @returns Quality score (0.0-1.0)
 */
export function calculateQualityScore(metrics: QualityMetrics): number {
  const { firstPassYield, defectCount, reworkHours, plannedHours, compliancePassed } = metrics;

  // First-pass yield is primary indicator
  const fpyScore = Math.max(0, Math.min(1, firstPassYield));

  // Defect rate penalty (max 0.3 penalty)
  const defectPenalty = Math.min(defectCount * 0.05, 0.3);

  // Rework penalty (normalized to planned hours, max 0.3)
  const reworkRatio = plannedHours > 0 ? reworkHours / plannedHours : 0;
  const reworkPenalty = Math.min(reworkRatio * 0.5, 0.3);

  // Compliance bonus
  const complianceBonus = compliancePassed ? 0.05 : 0;

  // Calculate final score, clamped to 0-1
  const score = fpyScore - defectPenalty - reworkPenalty + complianceBonus;
  return Math.max(0, Math.min(1, score));
}

// ============================================================================
// Cost Score Calculation
// ============================================================================

/**
 * Calculate cost efficiency score
 *
 * Formula:
 * - Budget score: under budget = 0.5-1.0, over budget = 0-1.0
 * - Market score: compared to benchmark
 * - Weighted: 60% budget, 40% market
 *
 * @param actualCost - Actual cost incurred
 * @param budgetAmount - Budgeted amount
 * @param marketBenchmark - Market average for this work type
 * @returns Cost score (0.0-1.0, higher is better/cheaper)
 */
export function calculateCostScore(
  actualCost: number,
  budgetAmount: number,
  marketBenchmark?: number
): number {
  if (budgetAmount <= 0) {
    return 0.5; // Default if no budget specified
  }

  // Cost efficiency vs budget
  const budgetRatio = actualCost / budgetAmount;
  let budgetScore: number;

  if (budgetRatio <= 1) {
    // Under budget: score ranges from 0.5 (at budget) to 1.0 (free)
    budgetScore = 1 - (1 - (1 - budgetRatio)) * 0.5;
    // Simplified: 1 - budgetRatio * 0.5 when under budget
    budgetScore = 0.5 + (1 - budgetRatio) * 0.5;
  } else {
    // Over budget: score drops from 1.0 at budget to 0 at 2x budget
    budgetScore = Math.max(0, 1 - (budgetRatio - 1));
  }

  // If no market benchmark, use budget score only
  if (!marketBenchmark || marketBenchmark <= 0) {
    return budgetScore;
  }

  // Market comparison
  const marketRatio = actualCost / marketBenchmark;
  // Score is 1.0 at 50% of market, 0.5 at market rate, 0 at 2x market
  const marketScore = Math.max(0, Math.min(1, 2 - marketRatio));

  // Weighted average (60% budget, 40% market)
  return budgetScore * 0.6 + marketScore * 0.4;
}

// ============================================================================
// Speed Score Calculation
// ============================================================================

export interface SpeedMetrics {
  plannedDuration: number; // hours
  actualDuration: number; // hours
  taktTarget?: number; // hours, if applicable
  actualTakt?: number; // hours, if applicable
}

/**
 * Calculate speed score
 *
 * Formula:
 * - Schedule score: planned/actual (capped at 1.0)
 * - Takt score: target/actual (if applicable)
 * - With takt: 30% schedule, 70% takt
 * - Without takt: 100% schedule
 *
 * @param metrics - Speed measurement inputs
 * @returns Speed score (0.0-1.0, higher is faster)
 */
export function calculateSpeedScore(metrics: SpeedMetrics): number {
  const { plannedDuration, actualDuration, taktTarget, actualTakt } = metrics;

  if (actualDuration <= 0) {
    return 1.0; // Instant completion
  }

  // Schedule adherence
  const scheduleRatio = plannedDuration / actualDuration;
  const scheduleScore = Math.max(0, Math.min(1, scheduleRatio));

  // If no takt target, use schedule score only
  if (!taktTarget || !actualTakt || actualTakt <= 0) {
    return scheduleScore;
  }

  // Takt adherence (capped at 2x performance = 1.0)
  const taktRatio = taktTarget / actualTakt;
  const taktScore = Math.min(taktRatio, 2) / 2;

  // Weighted average (takt more important when specified)
  return scheduleScore * 0.3 + taktScore * 0.7;
}

// ============================================================================
// Composite Score Calculation
// ============================================================================

/**
 * Calculate weighted composite score
 *
 * Formula: (quality * w_q) + (cost * w_c) + (speed * w_s)
 * where w_q + w_c + w_s = 1.0
 *
 * @param factors - USF factors (quality, cost, speed)
 * @param weights - Optional custom weights (defaults to 0.4/0.3/0.3)
 * @returns Composite score (0.0-1.0)
 */
export function calculateComposite(
  factors: USFFactors,
  weights: USFWeights = DEFAULT_USF_WEIGHTS
): number {
  // Normalize weights if they don't sum to 1
  const totalWeight = weights.quality + weights.cost + weights.speed;
  const normalizedWeights: USFWeights =
    totalWeight === 1.0
      ? weights
      : {
          quality: weights.quality / totalWeight,
          cost: weights.cost / totalWeight,
          speed: weights.speed / totalWeight,
        };

  return (
    factors.quality * normalizedWeights.quality +
    factors.cost * normalizedWeights.cost +
    factors.speed * normalizedWeights.speed
  );
}

// ============================================================================
// Confidence Score Calculation
// ============================================================================

/**
 * Calculate confidence score based on sample size and variance
 *
 * Formula:
 * - Size factor: log10(sampleSize + 1) / log10(51) (diminishing returns after 50)
 * - Variance penalty: min(variance * 2, 0.5)
 * - Minimum confidence: 0.1
 *
 * @param sampleSize - Number of work packets contributing to profile
 * @param variance - Statistical variance in performance metrics
 * @returns Confidence score (0.1-1.0)
 */
export function calculateConfidence(sampleSize: number, variance: number): number {
  // Sample size factor (diminishing returns after 50 samples)
  const sizeFactor = Math.min(1, Math.log10(sampleSize + 1) / Math.log10(51));

  // Variance penalty (high variance = low confidence)
  const variancePenalty = Math.min(variance * 2, 0.5);

  return Math.max(0.1, sizeFactor - variancePenalty);
}

// ============================================================================
// Pricing Calculations
// ============================================================================

/**
 * Calculate reputation multiplier from composite score
 *
 * Formula: 0.8 + (composite * 0.4)
 * Range: 0.8 (composite=0) to 1.2 (composite=1.0)
 *
 * @param compositeScore - Provider's composite USF score
 * @returns Reputation multiplier
 */
export function calculateReputationMultiplier(compositeScore: number): number {
  return 0.8 + compositeScore * 0.4;
}

/**
 * Determine pricing tier from USF profile
 *
 * @param qualityScore - Provider's quality score
 * @returns Appropriate pricing tier
 */
export function determinePricingTier(qualityScore: number): USFPricingTier {
  if (qualityScore >= USF_PRICING_TIERS.premium.qualityMin) {
    return 'premium';
  } else if (qualityScore >= USF_PRICING_TIERS.standard.qualityMin) {
    return 'standard';
  } else if (qualityScore >= USF_PRICING_TIERS.economy.qualityMin) {
    return 'economy';
  }
  return 'economy'; // Default
}

/**
 * Calculate final billing amount for a work packet
 *
 * Formula: baseRate × tierMultiplier × reputationMultiplier + varianceAdjustment
 *
 * @param baseRate - Market benchmark rate
 * @param tier - Pricing tier
 * @param compositeScore - Provider's composite score
 * @param variance - Optional variance adjustment (bonus/penalty)
 * @returns Final billing amount
 */
export function calculateBillingAmount(
  baseRate: number,
  tier: USFPricingTier,
  compositeScore: number,
  varianceAdjustment: number = 0
): number {
  const tierMultiplier = USF_PRICING_TIERS[tier].costMultiplier;
  const reputationMultiplier = calculateReputationMultiplier(compositeScore);

  return baseRate * tierMultiplier * reputationMultiplier + varianceAdjustment;
}

// ============================================================================
// Variance Calculations
// ============================================================================

export interface VarianceReport {
  qualityVariance: number;
  costVariance: number;
  costVariancePercent: number;
  scheduleVariance: number;
  scheduleVariancePercent: number;
}

/**
 * Calculate variance between targets and actuals
 *
 * @param targets - Planned targets
 * @param actuals - Actual results
 * @returns Variance report
 */
export function calculateVariance(
  targets: { quality: number; budget: number; duration: number },
  actuals: { quality: number; cost: number; duration: number }
): VarianceReport {
  const qualityVariance = actuals.quality - targets.quality;

  const costVariance = actuals.cost - targets.budget;
  const costVariancePercent = targets.budget > 0 ? (costVariance / targets.budget) * 100 : 0;

  const scheduleVariance = actuals.duration - targets.duration;
  const scheduleVariancePercent =
    targets.duration > 0 ? (scheduleVariance / targets.duration) * 100 : 0;

  return {
    qualityVariance,
    costVariance,
    costVariancePercent,
    scheduleVariance,
    scheduleVariancePercent,
  };
}

/**
 * Calculate bonus or penalty based on contract thresholds
 *
 * @param usfResults - Calculated USF scores
 * @param thresholds - Contract-defined thresholds
 * @param baseAmount - Base billing amount
 * @returns Adjustment amount (positive = bonus, negative = penalty)
 */
export function calculateContractAdjustment(
  usfResults: USFFactors,
  thresholds: {
    bonusTrigger?: number;
    bonusPercent?: number;
    penaltyTrigger?: number;
    penaltyPercent?: number;
  },
  baseAmount: number
): number {
  let adjustment = 0;

  // Check for bonus
  if (thresholds.bonusTrigger && thresholds.bonusPercent) {
    if (usfResults.quality >= thresholds.bonusTrigger) {
      adjustment += baseAmount * (thresholds.bonusPercent / 100);
    }
  }

  // Check for penalty
  if (thresholds.penaltyTrigger && thresholds.penaltyPercent) {
    if (usfResults.quality < thresholds.penaltyTrigger) {
      adjustment -= baseAmount * (thresholds.penaltyPercent / 100);
    }
  }

  return adjustment;
}

// ============================================================================
// Profile Update Logic
// ============================================================================

/**
 * Update profile factors with new work packet data using exponential moving average
 *
 * @param currentFactors - Current profile factors
 * @param newFactors - New factors from completed work packet
 * @param sampleSize - Current sample size
 * @returns Updated factors
 */
export function updateProfileFactors(
  currentFactors: USFFactors,
  newFactors: USFFactors,
  sampleSize: number
): USFFactors {
  // Use exponential moving average with alpha based on sample size
  // More weight to new data when sample size is small
  const alpha = Math.max(0.1, 1 / (sampleSize + 1));

  return {
    quality: currentFactors.quality * (1 - alpha) + newFactors.quality * alpha,
    cost: currentFactors.cost * (1 - alpha) + newFactors.cost * alpha,
    speed: currentFactors.speed * (1 - alpha) + newFactors.speed * alpha,
  };
}

// ============================================================================
// URN Helpers
// ============================================================================

/**
 * Build URN for USF profile
 */
export function buildUSFProfileURN(projectId: string, profileId: string): string {
  return `urn:luhtech:${projectId}:usf-profile:${profileId}`;
}

/**
 * Build URN for USF work packet
 */
export function buildUSFWorkPacketURN(projectId: string, workPacketId: string): string {
  return `urn:luhtech:${projectId}:usf-work-packet:${workPacketId}`;
}

// ============================================================================
// ID Generators
// ============================================================================

let profileIdCounter = 0;
let workPacketIdCounter = 0;

export function generateUSFProfileId(): string {
  profileIdCounter++;
  const year = new Date().getFullYear();
  return `USF-${year}-${String(profileIdCounter).padStart(4, '0')}`;
}

export function generateUSFWorkPacketId(): string {
  workPacketIdCounter++;
  const year = new Date().getFullYear();
  return `WP-${year}-${String(workPacketIdCounter).padStart(4, '0')}`;
}

export function setUSFIdCounter(type: 'profile' | 'work-packet', value: number): void {
  if (type === 'profile') {
    profileIdCounter = value;
  } else {
    workPacketIdCounter = value;
  }
}

// ============================================================================
// Service Export
// ============================================================================

export const USFService = {
  // Score calculations
  calculateQualityScore,
  calculateCostScore,
  calculateSpeedScore,
  calculateComposite,
  calculateConfidence,

  // Pricing
  calculateReputationMultiplier,
  determinePricingTier,
  calculateBillingAmount,

  // Variance
  calculateVariance,
  calculateContractAdjustment,

  // Profile updates
  updateProfileFactors,

  // URN helpers
  buildUSFProfileURN,
  buildUSFWorkPacketURN,

  // ID generators
  generateUSFProfileId,
  generateUSFWorkPacketId,
  setUSFIdCounter,

  // Constants
  DEFAULT_USF_WEIGHTS,
  USF_PRICING_TIERS,
};

export default USFService;
