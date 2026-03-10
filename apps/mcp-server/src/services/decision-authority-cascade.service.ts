/**
 * Decision Authority Cascade Service
 *
 * Enterprise-grade service for calculating required authority levels and
 * routing decisions through the 7-tier cascade based on impact analysis.
 *
 * Authority Levels:
 * 0 - FIELD: Field workers, observation only
 * 1 - FOREMAN: Trade foreman, $500 budget, 4 hours
 * 2 - SUPERINTENDENT: Site superintendent, $5,000 budget, 1 day
 * 3 - PM: Project Manager, $50,000 budget, 1 week
 * 4 - ARCHITECT: Design authority, design changes, 2 weeks
 * 5 - OWNER: Project owner, major decisions, 1 month
 * 6 - REGULATORY: Code/safety authority, any
 *
 * Impact Routing Factors:
 * - Budget Impact (40% weight)
 * - Schedule Impact (30% weight)
 * - Variance Amount (15% weight)
 * - Safety Flag (15% weight)
 *
 * @see .roadmap/architecture/voxel-ml-architecture.json
 * @module services/decision-authority-cascade
 * @version 1.0.0
 */

import { AuthorityLevel } from '../types/pm.types.js';
import {
  VoxelData,
  VoxelSystem,
  AuthorityLevel as VoxelAuthorityLevel,
} from '../types/voxel-decomposition.types.js';

// ==============================================================================
// Types
// ==============================================================================

/**
 * Authority tier configuration per architecture spec
 */
export interface AuthorityTier {
  level: number;
  name: AuthorityLevel;
  title: string;
  budgetLimit: number | 'design' | 'project' | 'code' | 'unlimited';
  budgetLimitCAD: number | 'design' | 'project' | 'unlimited';
  varianceTolerance: string;
  varianceToleranceMM: number;
  scheduleAuthority: string;
  scheduleAuthorityHours: number;
  autoApprove: boolean;
  description: string;
}

/**
 * Decision impact assessment input
 */
export interface DecisionImpact {
  budgetImpact: number; // Estimated cost in USD
  scheduleImpactDays: number; // Days of delay
  varianceAmountMM: number; // Physical deviation in mm
  isSafetyRelated: boolean; // Safety flag
  affectedSystems?: VoxelSystem[];
  isDesignChange?: boolean;
  isCodeRelated?: boolean;
  criticalPathAffected?: boolean;
}

/**
 * Authority routing result
 */
export interface AuthorityRoutingResult {
  requiredLevel: AuthorityLevel;
  requiredLevelNumber: number;
  requiredTitle: string;
  routingFactors: {
    budgetFactor: number;
    scheduleFactor: number;
    varianceFactor: number;
    safetyFactor: number;
    weightedScore: number;
  };
  escalationTriggers: string[];
  canAutoApprove: boolean;
  budgetWithinLimit: boolean;
  scheduleWithinLimit: boolean;
  varianceWithinTolerance: boolean;
  recommendation: string;
}

/**
 * Authority validation result
 */
export interface AuthorityValidationResult {
  canApprove: boolean;
  currentLevel: AuthorityLevel;
  requiredLevel: AuthorityLevel;
  gap: number;
  escalationRequired: boolean;
  escalationPath: AuthorityLevel[];
  message: string;
}

/**
 * Decision routing request
 */
export interface DecisionRoutingRequest {
  decisionId: string;
  projectId: string;
  voxelId?: string;
  impact: DecisionImpact;
  requestedBy: string;
  requestedByLevel: AuthorityLevel;
  description?: string;
}

/**
 * Decision routing response
 */
export interface DecisionRoutingResponse {
  decisionId: string;
  routing: AuthorityRoutingResult;
  validation: AuthorityValidationResult;
  voxelContext?: {
    voxelId: string;
    system: VoxelSystem;
    level?: string;
    zone?: string;
  };
  timestamp: Date;
}

/**
 * Impact factor weights per architecture spec
 */
export interface ImpactWeights {
  budgetImpact: number;
  scheduleImpact: number;
  varianceAmount: number;
  safetyFlag: number;
}

// ==============================================================================
// Constants
// ==============================================================================

/**
 * 7-tier authority cascade per voxel-ml-architecture.json
 */
export const AUTHORITY_TIERS: AuthorityTier[] = [
  {
    level: 0,
    name: AuthorityLevel.FIELD,
    title: 'Field Worker',
    budgetLimit: 0,
    budgetLimitCAD: 0,
    varianceTolerance: '0"',
    varianceToleranceMM: 0,
    scheduleAuthority: '0 days',
    scheduleAuthorityHours: 0,
    autoApprove: true,
    description: 'Observation and reporting only, no approval authority',
  },
  {
    level: 1,
    name: AuthorityLevel.FOREMAN,
    title: 'Foreman',
    budgetLimit: 500,
    budgetLimitCAD: 750,
    varianceTolerance: '1/8"',
    varianceToleranceMM: 3.175, // 1/8 inch = 3.175mm
    scheduleAuthority: '4 hours',
    scheduleAuthorityHours: 4,
    autoApprove: false,
    description: 'Minor field decisions within tolerance',
  },
  {
    level: 2,
    name: AuthorityLevel.SUPERINTENDENT,
    title: 'Superintendent',
    budgetLimit: 5000,
    budgetLimitCAD: 7500,
    varianceTolerance: '1/4"',
    varianceToleranceMM: 6.35, // 1/4 inch = 6.35mm
    scheduleAuthority: '1 day',
    scheduleAuthorityHours: 24,
    autoApprove: false,
    description: 'Day-to-day construction decisions',
  },
  {
    level: 3,
    name: AuthorityLevel.PM,
    title: 'Project Manager',
    budgetLimit: 50000,
    budgetLimitCAD: 37500,
    varianceTolerance: '1/2"',
    varianceToleranceMM: 12.7, // 1/2 inch = 12.7mm
    scheduleAuthority: '1 week',
    scheduleAuthorityHours: 168,
    autoApprove: false,
    description: 'Project-level decisions affecting schedule/budget',
  },
  {
    level: 4,
    name: AuthorityLevel.ARCHITECT,
    title: 'Architect/Engineer',
    budgetLimit: 'design',
    budgetLimitCAD: 'design',
    varianceTolerance: 'visible',
    varianceToleranceMM: 25.4, // 1 inch = visible threshold
    scheduleAuthority: '2 weeks',
    scheduleAuthorityHours: 336,
    autoApprove: false,
    description: 'Design decisions, structural changes, visible elements',
  },
  {
    level: 5,
    name: AuthorityLevel.OWNER,
    title: 'Owner/Executive',
    budgetLimit: 'project',
    budgetLimitCAD: 150000,
    varianceTolerance: 'major',
    varianceToleranceMM: 50.8, // 2 inches = major threshold
    scheduleAuthority: '1 month',
    scheduleAuthorityHours: 720,
    autoApprove: false,
    description: 'Major project decisions, scope changes',
  },
  {
    level: 6,
    name: AuthorityLevel.REGULATORY,
    title: 'Regulatory/Code',
    budgetLimit: 'code',
    budgetLimitCAD: 'unlimited',
    varianceTolerance: 'safety',
    varianceToleranceMM: Infinity,
    scheduleAuthority: 'any',
    scheduleAuthorityHours: Infinity,
    autoApprove: false,
    description: 'Permit requirements, code compliance, safety issues',
  },
];

/**
 * Impact factor weights per architecture spec
 */
export const DEFAULT_IMPACT_WEIGHTS: ImpactWeights = {
  budgetImpact: 0.4,
  scheduleImpact: 0.3,
  varianceAmount: 0.15,
  safetyFlag: 0.15,
};

/**
 * Escalation trigger descriptions
 */
export const ESCALATION_TRIGGERS = [
  'Budget exceeds authority limit',
  'Schedule exceeds authority limit',
  'Variance exceeds tolerance',
  'Safety concern flagged',
  'Multiple affected systems',
  'Previous similar decision rejected',
  'Critical path affected',
  'Design change required',
  'Code compliance issue',
];

// ==============================================================================
// Service Class
// ==============================================================================

/**
 * Decision Authority Cascade Service
 *
 * Calculates required authority levels and routes decisions through
 * the 7-tier cascade based on impact analysis.
 */
export class DecisionAuthorityCascadeService {
  private weights: ImpactWeights;

  constructor(weights?: Partial<ImpactWeights>) {
    this.weights = { ...DEFAULT_IMPACT_WEIGHTS, ...weights };
  }

  // ===========================================================================
  // Authority Level Calculation
  // ===========================================================================

  /**
   * Calculate required authority level based on decision impact
   *
   * Uses impact-based threshold matching per architecture spec:
   * - Budget impact (40% weight)
   * - Schedule impact (30% weight)
   * - Variance amount (15% weight)
   * - Safety flag (15% weight)
   */
  calculateRequiredAuthority(impact: DecisionImpact): AuthorityRoutingResult {
    const triggers: string[] = [];

    // Calculate factor scores (0-6 scale for each factor)
    const budgetLevel = this.calculateBudgetLevel(impact.budgetImpact);
    const scheduleLevel = this.calculateScheduleLevel(impact.scheduleImpactDays);
    const varianceLevel = this.calculateVarianceLevel(impact.varianceAmountMM);
    const safetyLevel = impact.isSafetyRelated ? 6 : 0;

    // Apply weights to get weighted score
    const weightedScore =
      budgetLevel * this.weights.budgetImpact +
      scheduleLevel * this.weights.scheduleImpact +
      varianceLevel * this.weights.varianceAmount +
      safetyLevel * this.weights.safetyFlag;

    // Determine required level (minimum based on weighted score)
    let requiredLevelNumber = Math.ceil(weightedScore);

    // Apply escalation triggers
    if (impact.isSafetyRelated) {
      requiredLevelNumber = 6;
      triggers.push('Safety concern flagged');
    }

    if (impact.isCodeRelated) {
      requiredLevelNumber = Math.max(requiredLevelNumber, 6);
      triggers.push('Code compliance issue');
    }

    if (impact.isDesignChange) {
      requiredLevelNumber = Math.max(requiredLevelNumber, 4);
      triggers.push('Design change required');
    }

    if (impact.criticalPathAffected) {
      requiredLevelNumber = Math.max(requiredLevelNumber, 3);
      triggers.push('Critical path affected');
    }

    if (impact.affectedSystems && impact.affectedSystems.length > 2) {
      requiredLevelNumber = Math.max(requiredLevelNumber, 3);
      triggers.push('Multiple affected systems');
    }

    // Clamp to valid range
    requiredLevelNumber = Math.max(0, Math.min(6, requiredLevelNumber));

    const tier = AUTHORITY_TIERS[requiredLevelNumber];

    // Check individual factor thresholds
    const budgetWithinLimit = this.isBudgetWithinLimit(
      impact.budgetImpact,
      tier
    );
    const scheduleWithinLimit = this.isScheduleWithinLimit(
      impact.scheduleImpactDays,
      tier
    );
    const varianceWithinTolerance = this.isVarianceWithinTolerance(
      impact.varianceAmountMM,
      tier
    );

    // Add triggers for threshold violations
    if (!budgetWithinLimit) {
      triggers.push('Budget exceeds authority limit');
    }
    if (!scheduleWithinLimit) {
      triggers.push('Schedule exceeds authority limit');
    }
    if (!varianceWithinTolerance) {
      triggers.push('Variance exceeds tolerance');
    }

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      tier,
      triggers,
      impact
    );

    return {
      requiredLevel: tier.name,
      requiredLevelNumber,
      requiredTitle: tier.title,
      routingFactors: {
        budgetFactor: budgetLevel,
        scheduleFactor: scheduleLevel,
        varianceFactor: varianceLevel,
        safetyFactor: safetyLevel,
        weightedScore,
      },
      escalationTriggers: triggers,
      canAutoApprove: tier.autoApprove && triggers.length === 0,
      budgetWithinLimit,
      scheduleWithinLimit,
      varianceWithinTolerance,
      recommendation,
    };
  }

  /**
   * Calculate budget-based authority level (0-6)
   */
  private calculateBudgetLevel(budgetImpact: number): number {
    if (budgetImpact <= 0) {return 0;}
    if (budgetImpact <= 500) {return 1;}
    if (budgetImpact <= 5000) {return 2;}
    if (budgetImpact <= 50000) {return 3;}
    if (budgetImpact <= 100000) {return 4;}
    if (budgetImpact <= 150000) {return 5;}
    return 6;
  }

  /**
   * Calculate schedule-based authority level (0-6)
   */
  private calculateScheduleLevel(scheduleImpactDays: number): number {
    const hours = scheduleImpactDays * 24;
    if (hours <= 0) {return 0;}
    if (hours <= 4) {return 1;} // 4 hours
    if (hours <= 24) {return 2;} // 1 day
    if (hours <= 168) {return 3;} // 1 week
    if (hours <= 336) {return 4;} // 2 weeks
    if (hours <= 720) {return 5;} // 1 month
    return 6;
  }

  /**
   * Calculate variance-based authority level (0-6)
   */
  private calculateVarianceLevel(varianceMM: number): number {
    if (varianceMM <= 0) {return 0;}
    if (varianceMM <= 3.175) {return 1;} // 1/8"
    if (varianceMM <= 6.35) {return 2;} // 1/4"
    if (varianceMM <= 12.7) {return 3;} // 1/2"
    if (varianceMM <= 25.4) {return 4;} // 1" (visible)
    if (varianceMM <= 50.8) {return 5;} // 2" (major)
    return 6;
  }

  /**
   * Check if budget is within authority limit
   */
  private isBudgetWithinLimit(budget: number, tier: AuthorityTier): boolean {
    if (typeof tier.budgetLimit === 'number') {
      return budget <= tier.budgetLimit;
    }
    // 'design', 'project', 'code', 'unlimited' = no limit
    return true;
  }

  /**
   * Check if schedule impact is within authority
   */
  private isScheduleWithinLimit(
    scheduleDays: number,
    tier: AuthorityTier
  ): boolean {
    const hours = scheduleDays * 24;
    return hours <= tier.scheduleAuthorityHours;
  }

  /**
   * Check if variance is within tolerance
   */
  private isVarianceWithinTolerance(
    varianceMM: number,
    tier: AuthorityTier
  ): boolean {
    return varianceMM <= tier.varianceToleranceMM;
  }

  /**
   * Generate human-readable recommendation
   */
  private generateRecommendation(
    tier: AuthorityTier,
    triggers: string[],
    impact: DecisionImpact
  ): string {
    if (tier.autoApprove && triggers.length === 0) {
      return 'Decision can be auto-approved at field level';
    }

    const parts: string[] = [];
    parts.push(`Requires ${tier.title} (Level ${tier.level}) approval`);

    if (triggers.length > 0) {
      parts.push(`Triggers: ${triggers.join(', ')}`);
    }

    if (impact.budgetImpact > 0) {
      parts.push(`Budget impact: $${impact.budgetImpact.toLocaleString()}`);
    }

    if (impact.scheduleImpactDays > 0) {
      parts.push(`Schedule impact: ${impact.scheduleImpactDays} days`);
    }

    return parts.join('. ');
  }

  // ===========================================================================
  // Authority Validation
  // ===========================================================================

  /**
   * Validate if a user at a given level can approve a decision
   */
  validateAuthority(
    userLevel: AuthorityLevel,
    requiredLevel: AuthorityLevel
  ): AuthorityValidationResult {
    const userLevelNumber = AUTHORITY_TIERS.findIndex(
      (t) => t.name === userLevel
    );
    const requiredLevelNumber = AUTHORITY_TIERS.findIndex(
      (t) => t.name === requiredLevel
    );

    const gap = requiredLevelNumber - userLevelNumber;
    const canApprove = userLevelNumber >= requiredLevelNumber;

    // Build escalation path
    const escalationPath: AuthorityLevel[] = [];
    if (!canApprove) {
      for (let i = userLevelNumber + 1; i <= requiredLevelNumber; i++) {
        escalationPath.push(AUTHORITY_TIERS[i].name);
      }
    }

    let message: string;
    if (canApprove) {
      message = `User has sufficient authority (Level ${userLevelNumber}: ${userLevel}) to approve this decision`;
    } else {
      message = `Decision requires escalation from ${userLevel} (Level ${userLevelNumber}) to ${requiredLevel} (Level ${requiredLevelNumber})`;
    }

    return {
      canApprove,
      currentLevel: userLevel,
      requiredLevel,
      gap,
      escalationRequired: !canApprove,
      escalationPath,
      message,
    };
  }

  // ===========================================================================
  // Decision Routing
  // ===========================================================================

  /**
   * Route a decision through the authority cascade
   */
  routeDecision(request: DecisionRoutingRequest): DecisionRoutingResponse {
    // Calculate required authority
    const routing = this.calculateRequiredAuthority(request.impact);

    // Validate requester's authority
    const validation = this.validateAuthority(
      request.requestedByLevel,
      routing.requiredLevel
    );

    return {
      decisionId: request.decisionId,
      routing,
      validation,
      voxelContext: request.voxelId
        ? {
            voxelId: request.voxelId,
            system: request.impact.affectedSystems?.[0] || VoxelSystem.UNKNOWN,
          }
        : undefined,
      timestamp: new Date(),
    };
  }

  /**
   * Get authority tier by level number
   */
  getTier(level: number): AuthorityTier | undefined {
    return AUTHORITY_TIERS[level];
  }

  /**
   * Get authority tier by name
   */
  getTierByName(name: AuthorityLevel): AuthorityTier | undefined {
    return AUTHORITY_TIERS.find((t) => t.name === name);
  }

  /**
   * Get all authority tiers
   */
  getAllTiers(): AuthorityTier[] {
    return [...AUTHORITY_TIERS];
  }

  /**
   * Get next escalation level
   */
  getEscalationTarget(currentLevel: AuthorityLevel): AuthorityLevel | null {
    const index = AUTHORITY_TIERS.findIndex((t) => t.name === currentLevel);
    if (index < 0 || index >= AUTHORITY_TIERS.length - 1) {
      return null;
    }
    return AUTHORITY_TIERS[index + 1].name;
  }

  // ===========================================================================
  // Voxel Integration
  // ===========================================================================

  /**
   * Calculate authority for a voxel-based decision
   *
   * Extracts impact factors from voxel context and calculates
   * the required authority level.
   */
  calculateVoxelDecisionAuthority(
    voxel: VoxelData,
    additionalImpact: Partial<DecisionImpact>
  ): AuthorityRoutingResult {
    // Build impact from voxel context
    const impact: DecisionImpact = {
      budgetImpact: additionalImpact.budgetImpact || voxel.estimatedCost || 0,
      scheduleImpactDays:
        additionalImpact.scheduleImpactDays ||
        this.estimateScheduleImpactFromVoxel(voxel),
      varianceAmountMM: additionalImpact.varianceAmountMM || 0,
      isSafetyRelated: additionalImpact.isSafetyRelated || false,
      affectedSystems: additionalImpact.affectedSystems || [voxel.system],
      isDesignChange: additionalImpact.isDesignChange || false,
      isCodeRelated: additionalImpact.isCodeRelated || false,
      criticalPathAffected:
        additionalImpact.criticalPathAffected || voxel.isCriticalPath,
    };

    return this.calculateRequiredAuthority(impact);
  }

  /**
   * Estimate schedule impact from voxel status
   */
  private estimateScheduleImpactFromVoxel(voxel: VoxelData): number {
    if (!voxel.plannedEnd || !voxel.plannedStart) {
      return 0;
    }

    // If blocked or has issues, estimate delay as remaining duration
    if (voxel.status === 'BLOCKED' || voxel.status === 'ISSUE') {
      const duration =
        (voxel.plannedEnd.getTime() - voxel.plannedStart.getTime()) /
        (1000 * 60 * 60 * 24);
      return Math.max(0, duration);
    }

    return 0;
  }

  /**
   * Get authority requirements for a voxel system type
   */
  getSystemAuthorityRequirements(system: VoxelSystem): {
    minLevel: AuthorityLevel;
    designChangeLevel: AuthorityLevel;
    safetyLevel: AuthorityLevel;
  } {
    // Different systems have different authority requirements
    switch (system) {
      case VoxelSystem.STRUCTURAL:
        return {
          minLevel: AuthorityLevel.PM,
          designChangeLevel: AuthorityLevel.ARCHITECT,
          safetyLevel: AuthorityLevel.REGULATORY,
        };
      case VoxelSystem.FIRE:
        return {
          minLevel: AuthorityLevel.SUPERINTENDENT,
          designChangeLevel: AuthorityLevel.ARCHITECT,
          safetyLevel: AuthorityLevel.REGULATORY,
        };
      case VoxelSystem.ELECTRICAL:
      case VoxelSystem.PLUMBING:
      case VoxelSystem.HVAC:
      case VoxelSystem.MECHANICAL:
        return {
          minLevel: AuthorityLevel.FOREMAN,
          designChangeLevel: AuthorityLevel.ARCHITECT,
          safetyLevel: AuthorityLevel.REGULATORY,
        };
      case VoxelSystem.ARCHITECTURAL:
        return {
          minLevel: AuthorityLevel.SUPERINTENDENT,
          designChangeLevel: AuthorityLevel.ARCHITECT,
          safetyLevel: AuthorityLevel.OWNER,
        };
      default:
        return {
          minLevel: AuthorityLevel.FOREMAN,
          designChangeLevel: AuthorityLevel.PM,
          safetyLevel: AuthorityLevel.REGULATORY,
        };
    }
  }
}

// ==============================================================================
// Factory Function
// ==============================================================================

/**
 * Create decision authority cascade service
 */
export function createDecisionAuthorityCascadeService(
  weights?: Partial<ImpactWeights>
): DecisionAuthorityCascadeService {
  return new DecisionAuthorityCascadeService(weights);
}

export default DecisionAuthorityCascadeService;
