/**
 * USF Labor Market Service - Phase 6: Labor Market Integration
 *
 * Enterprise labor market service for Universal Service Factors that provides
 * provider marketplace discovery, availability management, capacity planning,
 * intelligent matching algorithms, and work packet assignment.
 *
 * Features:
 * - Advanced provider search with multi-criteria filtering
 * - Real-time availability and capacity tracking
 * - Intelligent provider matching with constraint satisfaction
 * - Work packet assignment with conflict detection
 * - Market analytics for supply/demand analysis
 * - Provider scheduling and reservation system
 *
 * @see .roadmap/schemas/usf/usf-profile.schema.json
 * @version 1.0.0
 */

import type {
  USFProfile,
  USFWorkPacket,
  USFFactors,
  USFPricingTier,
  USFProviderType,
  USFLaborAllocation,
  PMURN,
  GraphMetadata,
} from '../types/pm.types.js';
import {
  calculateComposite,
  calculateReputationMultiplier,
  DEFAULT_USF_WEIGHTS,
} from './usf.service.js';
import { buildURN, createEmptyGraphMetadata } from './pm-urn.utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Provider availability status
 */
export type AvailabilityStatus =
  | 'available'
  | 'assigned'
  | 'unavailable'
  | 'limited';

/**
 * Assignment status for work packets
 */
export type AssignmentStatus =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled';

/**
 * Market segment classification
 */
export type MarketSegment = 'economy' | 'standard' | 'premium' | 'specialist';

/**
 * Provider availability window
 */
export interface AvailabilityWindow {
  /** Start of availability */
  startDate: string;
  /** End of availability */
  endDate: string;
  /** Hours available per day */
  hoursPerDay: number;
  /** Days available in window */
  daysAvailable: string[];
  /** Capacity percentage (0-100) */
  capacityPercent: number;
  /** Notes/constraints */
  notes?: string;
}

/**
 * Provider reservation
 */
export interface ProviderReservation {
  /** Unique reservation ID */
  reservationId: string;
  /** Provider URN */
  providerUrn: PMURN;
  /** Work packet URN if assigned */
  workPacketUrn?: PMURN;
  /** Project ID */
  projectId: string;
  /** Reserved period */
  period: {
    startDate: string;
    endDate: string;
  };
  /** Hours reserved */
  hoursReserved: number;
  /** Reservation status */
  status: 'tentative' | 'confirmed' | 'released' | 'expired';
  /** Priority (higher = more important) */
  priority: number;
  /** Created timestamp */
  createdAt: string;
  /** Expires if not confirmed */
  expiresAt?: string;
}

/**
 * Work assignment entity
 */
export interface WorkAssignment {
  /** Unique assignment ID */
  assignmentId: string;
  /** Work packet URN */
  workPacketUrn: PMURN;
  /** Provider URN */
  providerUrn: PMURN;
  /** Project ID */
  projectId: string;
  /** Assignment status */
  status: AssignmentStatus;
  /** Role in assignment */
  role: string;
  /** Allocation percentage */
  allocationPercent: number;
  /** Planned hours */
  plannedHours: number;
  /** Actual hours logged */
  actualHours: number;
  /** Scheduled period */
  scheduledPeriod: {
    startDate: string;
    endDate: string;
  };
  /** Match score when assigned */
  matchScore: number;
  /** Match reasons */
  matchReasons: string[];
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Provider search criteria
 */
export interface ProviderSearchCriteria {
  /** Project ID for context */
  projectId: string;
  /** Filter by provider types */
  providerTypes?: USFProviderType[];
  /** Minimum quality score */
  minQuality?: number;
  /** Maximum cost factor (relative to market) */
  maxCostFactor?: number;
  /** Minimum speed score */
  minSpeed?: number;
  /** Minimum composite score */
  minComposite?: number;
  /** Required trade/specialty */
  trade?: string;
  /** Required certifications */
  certifications?: string[];
  /** Availability requirement */
  availability?: {
    startDate: string;
    endDate: string;
    minHours?: number;
  };
  /** Location/region filter */
  location?: string;
  /** Pricing tier preference */
  pricingTier?: USFPricingTier;
  /** Minimum confidence score */
  minConfidence?: number;
  /** Exclude specific providers */
  excludeProviders?: PMURN[];
  /** Sort criteria */
  sortBy?:
    | 'quality'
    | 'cost'
    | 'speed'
    | 'composite'
    | 'availability'
    | 'matchScore';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Results limit */
  limit?: number;
}

/**
 * Provider match result with detailed scoring
 */
export interface ProviderMatch {
  /** Provider profile */
  profile: USFProfile;
  /** Overall match score (0-1) */
  matchScore: number;
  /** Score breakdown */
  scoreBreakdown: {
    qualityScore: number;
    costScore: number;
    speedScore: number;
    availabilityScore: number;
    certificationScore: number;
    tradeScore: number;
  };
  /** Match reasons/highlights */
  matchReasons: string[];
  /** Risk factors */
  riskFactors: string[];
  /** Availability windows */
  availabilityWindows: AvailabilityWindow[];
  /** Estimated hourly rate */
  estimatedRate: number;
  /** Recommended for assignment */
  recommended: boolean;
  /** Recommendation confidence */
  confidence: number;
}

/**
 * Market analytics snapshot
 */
export interface MarketAnalytics {
  /** Analysis timestamp */
  timestamp: string;
  /** Project/region context */
  context: {
    projectId?: string;
    region?: string;
    trade?: string;
  };
  /** Supply metrics */
  supply: {
    totalProviders: number;
    availableProviders: number;
    byType: Record<USFProviderType, number>;
    byTier: Record<USFPricingTier, number>;
    averageCapacity: number;
  };
  /** Demand metrics */
  demand: {
    activeWorkPackets: number;
    pendingAssignments: number;
    requiredHours: number;
    urgentRequests: number;
  };
  /** Market health indicators */
  health: {
    supplyDemandRatio: number;
    averageMatchScore: number;
    averageQuality: number;
    marketTightness: 'loose' | 'balanced' | 'tight' | 'critical';
    pricingPressure: 'downward' | 'stable' | 'upward';
  };
  /** Rate benchmarks */
  rateBenchmarks: {
    economy: { min: number; avg: number; max: number };
    standard: { min: number; avg: number; max: number };
    premium: { min: number; avg: number; max: number };
    specialist: { min: number; avg: number; max: number };
  };
  /** Recommendations */
  recommendations: string[];
}

/**
 * Assignment conflict
 */
export interface AssignmentConflict {
  /** Conflict type */
  type:
    | 'schedule_overlap'
    | 'capacity_exceeded'
    | 'certification_missing'
    | 'availability_gap';
  /** Severity */
  severity: 'warning' | 'error' | 'critical';
  /** Conflict description */
  description: string;
  /** Affected entities */
  affectedEntities: PMURN[];
  /** Suggested resolution */
  resolution?: string;
}

/**
 * Assignment result
 */
export interface AssignmentResult {
  /** Success flag */
  success: boolean;
  /** Created assignment */
  assignment?: WorkAssignment;
  /** Reservation created/updated */
  reservation?: ProviderReservation;
  /** Any conflicts detected */
  conflicts: AssignmentConflict[];
  /** Warnings */
  warnings: string[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Match score weights
 */
export const MATCH_SCORE_WEIGHTS = {
  quality: 0.3,
  cost: 0.2,
  speed: 0.15,
  availability: 0.2,
  certification: 0.1,
  trade: 0.05,
};

/**
 * Market tightness thresholds
 */
export const MARKET_TIGHTNESS_THRESHOLDS = {
  loose: 2.0, // 2+ providers per work packet
  balanced: 1.2,
  tight: 0.8,
  // Below 0.8 = critical
};

/**
 * Default rate benchmarks by segment (hourly USD)
 * Covers both MarketSegment ('specialist') and USFPricingTier ('expedited')
 */
export const DEFAULT_RATE_BENCHMARKS = {
  economy: { min: 35, avg: 50, max: 65 },
  standard: { min: 60, avg: 85, max: 110 },
  premium: { min: 100, avg: 140, max: 180 },
  specialist: { min: 120, avg: 170, max: 220 },
  expedited: { min: 150, avg: 200, max: 300 },
};

// ============================================================================
// In-Memory Storage (for demonstration - real impl uses database)
// ============================================================================

const providerStore = new Map<PMURN, USFProfile>();
const reservationStore = new Map<string, ProviderReservation>();
const assignmentStore = new Map<string, WorkAssignment>();
const availabilityStore = new Map<PMURN, AvailabilityWindow[]>();

// ============================================================================
// ID Generators
// ============================================================================

let reservationIdCounter = 0;
let assignmentIdCounter = 0;

export function generateReservationId(): string {
  reservationIdCounter++;
  const year = new Date().getFullYear();
  return `RES-${year}-${String(reservationIdCounter).padStart(5, '0')}`;
}

export function generateAssignmentId(): string {
  assignmentIdCounter++;
  const year = new Date().getFullYear();
  return `ASN-${year}-${String(assignmentIdCounter).padStart(5, '0')}`;
}

export function setLaborMarketIdCounter(
  type: 'reservation' | 'assignment',
  value: number
): void {
  if (type === 'reservation') {
    reservationIdCounter = value;
  } else {
    assignmentIdCounter = value;
  }
}

// ============================================================================
// Provider Registry Functions
// ============================================================================

/**
 * Register a provider in the labor market
 */
export function registerProvider(profile: USFProfile): void {
  providerStore.set(profile.$id, profile);
}

/**
 * Get provider by URN
 */
export function getProvider(providerUrn: PMURN): USFProfile | undefined {
  return providerStore.get(providerUrn);
}

/**
 * Get all registered providers
 */
export function getAllProviders(): USFProfile[] {
  return Array.from(providerStore.values());
}

/**
 * Update provider availability status
 */
export function updateProviderAvailability(
  providerUrn: PMURN,
  status: AvailabilityStatus,
  nextAvailable?: string,
  capacity?: number
): USFProfile | undefined {
  const provider = providerStore.get(providerUrn);
  if (!provider) {
    return undefined;
  }

  const updated: USFProfile = {
    ...provider,
    availability: {
      status,
      nextAvailable,
      capacity,
    },
    updatedAt: new Date().toISOString(),
  };

  providerStore.set(providerUrn, updated);
  return updated;
}

// ============================================================================
// Availability Management Functions
// ============================================================================

/**
 * Set availability windows for a provider
 */
export function setAvailabilityWindows(
  providerUrn: PMURN,
  windows: AvailabilityWindow[]
): void {
  availabilityStore.set(providerUrn, windows);
}

/**
 * Get availability windows for a provider
 */
export function getAvailabilityWindows(
  providerUrn: PMURN
): AvailabilityWindow[] {
  return availabilityStore.get(providerUrn) || [];
}

/**
 * Check if provider is available for a period
 */
export function checkProviderAvailability(
  providerUrn: PMURN,
  startDate: string,
  endDate: string,
  requiredHours?: number
): {
  available: boolean;
  availableHours: number;
  conflicts: string[];
  windows: AvailabilityWindow[];
} {
  const provider = providerStore.get(providerUrn);
  if (!provider) {
    return {
      available: false,
      availableHours: 0,
      conflicts: ['Provider not found'],
      windows: [],
    };
  }

  // Check base availability status
  if (provider.availability?.status === 'unavailable') {
    return {
      available: false,
      availableHours: 0,
      conflicts: ['Provider marked as unavailable'],
      windows: [],
    };
  }

  // Check existing reservations for conflicts
  const conflicts: string[] = [];
  const existingReservations = Array.from(reservationStore.values()).filter(
    (r) =>
      r.providerUrn === providerUrn &&
      r.status !== 'released' &&
      r.status !== 'expired'
  );

  const requestStart = new Date(startDate);
  const requestEnd = new Date(endDate);

  for (const reservation of existingReservations) {
    const resStart = new Date(reservation.period.startDate);
    const resEnd = new Date(reservation.period.endDate);

    // Check for overlap
    if (requestStart <= resEnd && requestEnd >= resStart) {
      conflicts.push(
        `Overlaps with reservation ${reservation.reservationId} (${reservation.period.startDate} - ${reservation.period.endDate})`
      );
    }
  }

  // Get availability windows
  const windows = getAvailabilityWindows(providerUrn);
  const matchingWindows = windows.filter((w) => {
    const winStart = new Date(w.startDate);
    const winEnd = new Date(w.endDate);
    return requestStart <= winEnd && requestEnd >= winStart;
  });

  // Calculate available hours
  let availableHours = 0;
  if (matchingWindows.length > 0) {
    for (const window of matchingWindows) {
      availableHours +=
        window.hoursPerDay *
        window.daysAvailable.length *
        (window.capacityPercent / 100);
    }
  } else {
    // Default: assume 8 hours/day, 5 days/week
    const days = Math.ceil(
      (requestEnd.getTime() - requestStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const workDays = Math.ceil((days * 5) / 7);
    const capacity = provider.availability?.capacity ?? 100;
    availableHours = workDays * 8 * (capacity / 100);
  }

  const meetsHourRequirement =
    !requiredHours || availableHours >= requiredHours;

  return {
    available: conflicts.length === 0 && meetsHourRequirement,
    availableHours,
    conflicts,
    windows: matchingWindows,
  };
}

// ============================================================================
// Reservation Functions
// ============================================================================

/**
 * Create a provider reservation
 */
export function createReservation(
  providerUrn: PMURN,
  projectId: string,
  period: { startDate: string; endDate: string },
  hoursReserved: number,
  options?: {
    workPacketUrn?: PMURN;
    priority?: number;
    expiresInHours?: number;
  }
): ProviderReservation | { error: string } {
  const now = new Date();
  const availability = checkProviderAvailability(
    providerUrn,
    period.startDate,
    period.endDate,
    hoursReserved
  );

  if (!availability.available) {
    return {
      error: `Provider not available: ${availability.conflicts.join(', ')}`,
    };
  }

  const reservationId = generateReservationId();
  const expiresAt = options?.expiresInHours
    ? new Date(
        now.getTime() + options.expiresInHours * 60 * 60 * 1000
      ).toISOString()
    : undefined;

  const reservation: ProviderReservation = {
    reservationId,
    providerUrn,
    workPacketUrn: options?.workPacketUrn,
    projectId,
    period,
    hoursReserved,
    status: 'tentative',
    priority: options?.priority ?? 1,
    createdAt: now.toISOString(),
    expiresAt,
  };

  reservationStore.set(reservationId, reservation);

  // Update provider availability status
  updateProviderAvailability(providerUrn, 'limited');

  return reservation;
}

/**
 * Confirm a reservation
 */
export function confirmReservation(
  reservationId: string
): ProviderReservation | { error: string } {
  const reservation = reservationStore.get(reservationId);
  if (!reservation) {
    return { error: `Reservation not found: ${reservationId}` };
  }

  if (reservation.status !== 'tentative') {
    return {
      error: `Cannot confirm reservation in status: ${reservation.status}`,
    };
  }

  const updated: ProviderReservation = {
    ...reservation,
    status: 'confirmed',
  };

  reservationStore.set(reservationId, updated);
  return updated;
}

/**
 * Release a reservation
 */
export function releaseReservation(
  reservationId: string
): ProviderReservation | { error: string } {
  const reservation = reservationStore.get(reservationId);
  if (!reservation) {
    return { error: `Reservation not found: ${reservationId}` };
  }

  const updated: ProviderReservation = {
    ...reservation,
    status: 'released',
  };

  reservationStore.set(reservationId, updated);

  // Check if provider has any other active reservations
  const otherReservations = Array.from(reservationStore.values()).filter(
    (r) =>
      r.providerUrn === reservation.providerUrn &&
      r.reservationId !== reservationId &&
      (r.status === 'tentative' || r.status === 'confirmed')
  );

  if (otherReservations.length === 0) {
    updateProviderAvailability(reservation.providerUrn, 'available');
  }

  return updated;
}

/**
 * Get reservations for a provider
 */
export function getProviderReservations(
  providerUrn: PMURN
): ProviderReservation[] {
  return Array.from(reservationStore.values()).filter(
    (r) => r.providerUrn === providerUrn
  );
}

// ============================================================================
// Provider Search & Matching Functions
// ============================================================================

/**
 * Search for providers matching criteria
 */
export function searchProviders(
  criteria: ProviderSearchCriteria
): ProviderMatch[] {
  const providers = getAllProviders();
  const matches: ProviderMatch[] = [];

  for (const profile of providers) {
    // Apply exclusion filter
    if (criteria.excludeProviders?.includes(profile.$id)) {
      continue;
    }

    // Apply provider type filter
    if (criteria.providerTypes && criteria.providerTypes.length > 0) {
      if (!criteria.providerTypes.includes(profile.providerType)) {
        continue;
      }
    }

    // Calculate match score
    const match = calculateProviderMatch(profile, criteria);

    // Apply minimum score filters
    if (criteria.minQuality && profile.factors.quality < criteria.minQuality) {
      continue;
    }
    if (criteria.minSpeed && profile.factors.speed < criteria.minSpeed) {
      continue;
    }
    if (criteria.minComposite) {
      const composite = calculateComposite(
        profile.factors,
        DEFAULT_USF_WEIGHTS
      );
      if (composite < criteria.minComposite) {
        continue;
      }
    }
    if (criteria.minConfidence && profile.confidence) {
      if (profile.confidence.score < criteria.minConfidence) {
        continue;
      }
    }

    matches.push(match);
  }

  // Sort results
  const sortBy = criteria.sortBy || 'matchScore';
  const sortOrder = criteria.sortOrder || 'desc';

  matches.sort((a, b) => {
    let valueA: number, valueB: number;

    switch (sortBy) {
      case 'quality':
        valueA = a.profile.factors.quality;
        valueB = b.profile.factors.quality;
        break;
      case 'cost':
        valueA = a.profile.factors.cost;
        valueB = b.profile.factors.cost;
        break;
      case 'speed':
        valueA = a.profile.factors.speed;
        valueB = b.profile.factors.speed;
        break;
      case 'composite':
        valueA = calculateComposite(a.profile.factors, DEFAULT_USF_WEIGHTS);
        valueB = calculateComposite(b.profile.factors, DEFAULT_USF_WEIGHTS);
        break;
      case 'availability':
        valueA = a.scoreBreakdown.availabilityScore;
        valueB = b.scoreBreakdown.availabilityScore;
        break;
      default:
        valueA = a.matchScore;
        valueB = b.matchScore;
    }

    return sortOrder === 'desc' ? valueB - valueA : valueA - valueB;
  });

  // Apply limit
  const limit = criteria.limit || 10;
  return matches.slice(0, limit);
}

/**
 * Calculate detailed match score for a provider
 */
export function calculateProviderMatch(
  profile: USFProfile,
  criteria: ProviderSearchCriteria
): ProviderMatch {
  const scoreBreakdown = {
    qualityScore: 0,
    costScore: 0,
    speedScore: 0,
    availabilityScore: 0,
    certificationScore: 0,
    tradeScore: 0,
  };

  const matchReasons: string[] = [];
  const riskFactors: string[] = [];

  // Quality score (30%)
  const minQuality = criteria.minQuality || 0.7;
  if (profile.factors.quality >= minQuality) {
    const qualityBonus = Math.min(
      (profile.factors.quality - minQuality) / 0.3,
      1
    );
    scoreBreakdown.qualityScore = 0.5 + 0.5 * qualityBonus;
    matchReasons.push(
      `Quality ${(profile.factors.quality * 100).toFixed(0)}% meets requirement`
    );
  } else {
    scoreBreakdown.qualityScore = (profile.factors.quality / minQuality) * 0.5;
    riskFactors.push(
      `Quality ${(profile.factors.quality * 100).toFixed(0)}% below target ${(minQuality * 100).toFixed(0)}%`
    );
  }

  // Cost score (20%) - higher is better (more cost efficient)
  const maxCostFactor = criteria.maxCostFactor || 1.2;
  if (profile.factors.cost >= 0.7) {
    scoreBreakdown.costScore = profile.factors.cost;
    matchReasons.push(
      `Cost efficiency ${(profile.factors.cost * 100).toFixed(0)}%`
    );
  } else {
    scoreBreakdown.costScore = (profile.factors.cost / 0.7) * 0.5;
    riskFactors.push(
      `Cost efficiency ${(profile.factors.cost * 100).toFixed(0)}% may exceed budget`
    );
  }

  // Speed score (15%)
  const minSpeed = criteria.minSpeed || 0.6;
  if (profile.factors.speed >= minSpeed) {
    scoreBreakdown.speedScore = Math.min(profile.factors.speed / minSpeed, 1);
    matchReasons.push(
      `Speed ${(profile.factors.speed * 100).toFixed(0)}% meets requirement`
    );
  } else {
    scoreBreakdown.speedScore = (profile.factors.speed / minSpeed) * 0.5;
    riskFactors.push(
      `Speed ${(profile.factors.speed * 100).toFixed(0)}% may cause delays`
    );
  }

  // Availability score (20%)
  if (criteria.availability) {
    const availability = checkProviderAvailability(
      profile.$id,
      criteria.availability.startDate,
      criteria.availability.endDate,
      criteria.availability.minHours
    );

    if (availability.available) {
      const hoursRatio = criteria.availability.minHours
        ? Math.min(
            availability.availableHours / criteria.availability.minHours,
            1
          )
        : 1;
      scoreBreakdown.availabilityScore = hoursRatio;
      matchReasons.push(
        `Available with ${availability.availableHours.toFixed(0)} hours capacity`
      );
    } else {
      scoreBreakdown.availabilityScore = 0.2;
      riskFactors.push(
        `Availability conflicts: ${availability.conflicts.join(', ')}`
      );
    }
  } else {
    // No availability requirement - check general status
    if (profile.availability?.status === 'available') {
      scoreBreakdown.availabilityScore = 1;
      matchReasons.push('Currently available');
    } else if (profile.availability?.status === 'limited') {
      scoreBreakdown.availabilityScore = 0.6;
      matchReasons.push('Limited availability');
    } else {
      scoreBreakdown.availabilityScore = 0.3;
      riskFactors.push('Availability uncertain');
    }
  }

  // Certification score (10%)
  if (criteria.certifications && criteria.certifications.length > 0) {
    const providerCerts = profile.providerInfo?.certifications || [];
    const matchingCerts = criteria.certifications.filter((c) =>
      providerCerts.some((pc) => pc.toLowerCase().includes(c.toLowerCase()))
    );
    scoreBreakdown.certificationScore =
      matchingCerts.length / criteria.certifications.length;

    if (matchingCerts.length > 0) {
      matchReasons.push(
        `Has ${matchingCerts.length}/${criteria.certifications.length} required certifications`
      );
    }
    if (matchingCerts.length < criteria.certifications.length) {
      riskFactors.push(
        `Missing certifications: ${criteria.certifications.filter((c) => !matchingCerts.includes(c)).join(', ')}`
      );
    }
  } else {
    scoreBreakdown.certificationScore = 1; // No requirement
  }

  // Trade score (5%)
  if (criteria.trade) {
    const providerTrade = profile.providerInfo?.trade?.toLowerCase() || '';
    const requiredTrade = criteria.trade.toLowerCase();

    if (
      providerTrade.includes(requiredTrade) ||
      requiredTrade.includes(providerTrade)
    ) {
      scoreBreakdown.tradeScore = 1;
      matchReasons.push(`Trade match: ${profile.providerInfo?.trade}`);
    } else {
      scoreBreakdown.tradeScore = 0.3;
      riskFactors.push(
        `Trade mismatch: has ${profile.providerInfo?.trade || 'unspecified'}, need ${criteria.trade}`
      );
    }
  } else {
    scoreBreakdown.tradeScore = 1; // No requirement
  }

  // Calculate weighted match score
  const matchScore =
    scoreBreakdown.qualityScore * MATCH_SCORE_WEIGHTS.quality +
    scoreBreakdown.costScore * MATCH_SCORE_WEIGHTS.cost +
    scoreBreakdown.speedScore * MATCH_SCORE_WEIGHTS.speed +
    scoreBreakdown.availabilityScore * MATCH_SCORE_WEIGHTS.availability +
    scoreBreakdown.certificationScore * MATCH_SCORE_WEIGHTS.certification +
    scoreBreakdown.tradeScore * MATCH_SCORE_WEIGHTS.trade;

  // Calculate estimated rate
  const composite = calculateComposite(profile.factors, DEFAULT_USF_WEIGHTS);
  const reputationMultiplier = calculateReputationMultiplier(composite);
  const baseBenchmark =
    DEFAULT_RATE_BENCHMARKS[profile.pricingTier || 'standard'];
  const estimatedRate = baseBenchmark.avg * reputationMultiplier;

  // Get availability windows
  const availabilityWindows = getAvailabilityWindows(profile.$id);

  // Determine recommendation
  const recommended = matchScore >= 0.7 && riskFactors.length <= 1;
  const confidence = profile.confidence?.score || 0.5;

  return {
    profile,
    matchScore,
    scoreBreakdown,
    matchReasons,
    riskFactors,
    availabilityWindows,
    estimatedRate,
    recommended,
    confidence,
  };
}

/**
 * Find optimal provider for a work packet
 */
export function findOptimalProvider(
  workPacket: USFWorkPacket,
  additionalCriteria?: Partial<ProviderSearchCriteria>
): ProviderMatch | undefined {
  const criteria: ProviderSearchCriteria = {
    projectId: workPacket.projectId,
    minQuality: workPacket.targets.qualityTarget,
    trade: workPacket.workType,
    sortBy: 'matchScore',
    sortOrder: 'desc',
    limit: 1,
    ...additionalCriteria,
  };

  // Add availability requirement if work packet has schedule
  if (workPacket.startedAt || workPacket.createdAt) {
    const startDate = workPacket.startedAt || workPacket.createdAt;
    const durationHours = workPacket.targets.durationHours || 40;
    const endDate = new Date(
      new Date(startDate).getTime() + durationHours * 60 * 60 * 1000
    ).toISOString();

    criteria.availability = {
      startDate,
      endDate,
      minHours: durationHours,
    };
  }

  const matches = searchProviders(criteria);
  return matches.length > 0 ? matches[0] : undefined;
}

// ============================================================================
// Work Assignment Functions
// ============================================================================

/**
 * Assign a provider to a work packet
 */
export function assignProviderToWorkPacket(
  providerUrn: PMURN,
  workPacketUrn: PMURN,
  projectId: string,
  options: {
    role?: string;
    allocationPercent?: number;
    plannedHours?: number;
    scheduledPeriod: { startDate: string; endDate: string };
  }
): AssignmentResult {
  const conflicts: AssignmentConflict[] = [];
  const warnings: string[] = [];

  // Get provider
  const provider = getProvider(providerUrn);
  if (!provider) {
    return {
      success: false,
      conflicts: [
        {
          type: 'availability_gap',
          severity: 'critical',
          description: 'Provider not found in labor market',
          affectedEntities: [providerUrn],
        },
      ],
      warnings: [],
    };
  }

  // Check availability
  const availability = checkProviderAvailability(
    providerUrn,
    options.scheduledPeriod.startDate,
    options.scheduledPeriod.endDate,
    options.plannedHours
  );

  if (!availability.available) {
    for (const conflict of availability.conflicts) {
      conflicts.push({
        type: 'schedule_overlap',
        severity: 'error',
        description: conflict,
        affectedEntities: [providerUrn, workPacketUrn],
        resolution: 'Consider alternative provider or adjust schedule',
      });
    }
  }

  // Check capacity
  const allocationPercent = options.allocationPercent || 100;
  if (provider.availability?.capacity !== undefined) {
    const currentCapacity = provider.availability.capacity;
    if (allocationPercent > currentCapacity) {
      conflicts.push({
        type: 'capacity_exceeded',
        severity: 'error',
        description: `Allocation ${allocationPercent}% exceeds available capacity ${currentCapacity}%`,
        affectedEntities: [providerUrn],
        resolution: 'Reduce allocation or wait for capacity',
      });
    }
  }

  // Check for existing assignments to same work packet
  const existingAssignments = Array.from(assignmentStore.values()).filter(
    (a) => a.workPacketUrn === workPacketUrn && a.status !== 'cancelled'
  );

  const totalAllocation = existingAssignments.reduce(
    (sum, a) => sum + a.allocationPercent,
    0
  );
  if (totalAllocation + allocationPercent > 100) {
    warnings.push(
      `Total allocation will be ${totalAllocation + allocationPercent}% (exceeds 100%)`
    );
  }

  // If critical conflicts, fail
  if (
    conflicts.some((c) => c.severity === 'critical' || c.severity === 'error')
  ) {
    return { success: false, conflicts, warnings };
  }

  // Calculate match score for record
  const match = calculateProviderMatch(provider, {
    projectId,
    availability: {
      startDate: options.scheduledPeriod.startDate,
      endDate: options.scheduledPeriod.endDate,
      minHours: options.plannedHours,
    },
  });

  // Create reservation
  const reservation = createReservation(
    providerUrn,
    projectId,
    options.scheduledPeriod,
    options.plannedHours || 40,
    { workPacketUrn }
  );

  if ('error' in reservation) {
    return {
      success: false,
      conflicts: [
        {
          type: 'availability_gap',
          severity: 'error',
          description: reservation.error,
          affectedEntities: [providerUrn, workPacketUrn],
        },
      ],
      warnings,
    };
  }

  // Confirm reservation immediately for assignment
  confirmReservation(reservation.reservationId);

  // Create assignment
  const now = new Date().toISOString();
  const assignmentId = generateAssignmentId();

  const assignment: WorkAssignment = {
    assignmentId,
    workPacketUrn,
    providerUrn,
    projectId,
    status: 'confirmed',
    role: options.role || 'primary',
    allocationPercent,
    plannedHours: options.plannedHours || 40,
    actualHours: 0,
    scheduledPeriod: options.scheduledPeriod,
    matchScore: match.matchScore,
    matchReasons: match.matchReasons,
    createdAt: now,
    updatedAt: now,
  };

  assignmentStore.set(assignmentId, assignment);

  // Update provider status
  updateProviderAvailability(providerUrn, 'assigned');

  return {
    success: true,
    assignment,
    reservation,
    conflicts,
    warnings,
  };
}

/**
 * Get assignments for a work packet
 */
export function getWorkPacketAssignments(
  workPacketUrn: PMURN
): WorkAssignment[] {
  return Array.from(assignmentStore.values()).filter(
    (a) => a.workPacketUrn === workPacketUrn
  );
}

/**
 * Get assignments for a provider
 */
export function getProviderAssignments(providerUrn: PMURN): WorkAssignment[] {
  return Array.from(assignmentStore.values()).filter(
    (a) => a.providerUrn === providerUrn
  );
}

/**
 * Complete an assignment
 */
export function completeAssignment(
  assignmentId: string,
  actualHours: number
): WorkAssignment | { error: string } {
  const assignment = assignmentStore.get(assignmentId);
  if (!assignment) {
    return { error: `Assignment not found: ${assignmentId}` };
  }

  const now = new Date().toISOString();
  const updated: WorkAssignment = {
    ...assignment,
    status: 'completed',
    actualHours,
    updatedAt: now,
    completedAt: now,
  };

  assignmentStore.set(assignmentId, updated);

  // Release the associated reservation
  const reservations = Array.from(reservationStore.values()).filter(
    (r) =>
      r.workPacketUrn === assignment.workPacketUrn &&
      r.providerUrn === assignment.providerUrn
  );

  for (const reservation of reservations) {
    releaseReservation(reservation.reservationId);
  }

  return updated;
}

// ============================================================================
// Market Analytics Functions
// ============================================================================

/**
 * Generate market analytics snapshot
 */
export function generateMarketAnalytics(
  projectId?: string,
  region?: string,
  trade?: string
): MarketAnalytics {
  const now = new Date().toISOString();
  let providers = getAllProviders();

  // Filter by criteria if provided
  if (trade) {
    providers = providers.filter((p) =>
      p.providerInfo?.trade?.toLowerCase().includes(trade.toLowerCase())
    );
  }
  if (region) {
    providers = providers.filter((p) =>
      p.providerInfo?.location?.toLowerCase().includes(region.toLowerCase())
    );
  }

  // Calculate supply metrics
  const totalProviders = providers.length;
  const availableProviders = providers.filter(
    (p) =>
      p.availability?.status === 'available' ||
      p.availability?.status === 'limited'
  ).length;

  const byType: Record<USFProviderType, number> = {
    human: 0,
    robot: 0,
    agent: 0,
    team: 0,
    subcontractor: 0,
    aggregate: 0,
  };

  const byTier: Record<USFPricingTier, number> = {
    economy: 0,
    standard: 0,
    premium: 0,
    expedited: 0,
  };

  let totalCapacity = 0;
  for (const provider of providers) {
    byType[provider.providerType]++;
    byTier[provider.pricingTier || 'standard']++;
    totalCapacity += provider.availability?.capacity ?? 100;
  }

  const averageCapacity =
    totalProviders > 0 ? totalCapacity / totalProviders : 0;

  // Calculate demand metrics (from active assignments and reservations)
  const activeAssignments = Array.from(assignmentStore.values()).filter(
    (a) => a.status === 'confirmed' || a.status === 'active'
  );
  const pendingReservations = Array.from(reservationStore.values()).filter(
    (r) => r.status === 'tentative'
  );

  const requiredHours = activeAssignments.reduce(
    (sum, a) => sum + a.plannedHours,
    0
  );
  const urgentRequests = pendingReservations.filter(
    (r) => r.priority >= 3
  ).length;

  // Calculate market health
  const supplyDemandRatio =
    activeAssignments.length > 0
      ? availableProviders / activeAssignments.length
      : availableProviders > 0
        ? 10
        : 0;

  let marketTightness: 'loose' | 'balanced' | 'tight' | 'critical';
  if (supplyDemandRatio >= MARKET_TIGHTNESS_THRESHOLDS.loose) {
    marketTightness = 'loose';
  } else if (supplyDemandRatio >= MARKET_TIGHTNESS_THRESHOLDS.balanced) {
    marketTightness = 'balanced';
  } else if (supplyDemandRatio >= MARKET_TIGHTNESS_THRESHOLDS.tight) {
    marketTightness = 'tight';
  } else {
    marketTightness = 'critical';
  }

  // Calculate average quality
  const averageQuality =
    providers.length > 0
      ? providers.reduce((sum, p) => sum + p.factors.quality, 0) /
        providers.length
      : 0;

  // Calculate average match score from recent assignments
  const averageMatchScore =
    activeAssignments.length > 0
      ? activeAssignments.reduce((sum, a) => sum + a.matchScore, 0) /
        activeAssignments.length
      : 0;

  // Determine pricing pressure
  let pricingPressure: 'downward' | 'stable' | 'upward';
  if (marketTightness === 'loose') {
    pricingPressure = 'downward';
  } else if (marketTightness === 'critical' || marketTightness === 'tight') {
    pricingPressure = 'upward';
  } else {
    pricingPressure = 'stable';
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (marketTightness === 'critical') {
    recommendations.push(
      'Critical: Insufficient provider capacity. Consider onboarding new providers.'
    );
  }
  if (marketTightness === 'tight') {
    recommendations.push(
      'Market tight: Plan assignments early to secure best providers.'
    );
  }
  if (averageQuality < 0.75) {
    recommendations.push(
      'Average quality below target. Consider quality improvement programs.'
    );
  }
  if (pendingReservations.length > availableProviders) {
    recommendations.push(
      `${pendingReservations.length} pending reservations exceed available providers.`
    );
  }
  if (urgentRequests > 0) {
    recommendations.push(
      `${urgentRequests} urgent requests require immediate attention.`
    );
  }

  return {
    timestamp: now,
    context: { projectId, region, trade },
    supply: {
      totalProviders,
      availableProviders,
      byType,
      byTier,
      averageCapacity,
    },
    demand: {
      activeWorkPackets: activeAssignments.length,
      pendingAssignments: pendingReservations.length,
      requiredHours,
      urgentRequests,
    },
    health: {
      supplyDemandRatio,
      averageMatchScore,
      averageQuality,
      marketTightness,
      pricingPressure,
    },
    rateBenchmarks: DEFAULT_RATE_BENCHMARKS,
    recommendations,
  };
}

// ============================================================================
// Service Export
// ============================================================================

export const USFLaborMarketService = {
  // Provider registry
  registerProvider,
  getProvider,
  getAllProviders,
  updateProviderAvailability,

  // Availability management
  setAvailabilityWindows,
  getAvailabilityWindows,
  checkProviderAvailability,

  // Reservations
  createReservation,
  confirmReservation,
  releaseReservation,
  getProviderReservations,

  // Search & matching
  searchProviders,
  calculateProviderMatch,
  findOptimalProvider,

  // Work assignments
  assignProviderToWorkPacket,
  getWorkPacketAssignments,
  getProviderAssignments,
  completeAssignment,

  // Market analytics
  generateMarketAnalytics,

  // ID generators
  generateReservationId,
  generateAssignmentId,
  setLaborMarketIdCounter,

  // Constants
  MATCH_SCORE_WEIGHTS,
  MARKET_TIGHTNESS_THRESHOLDS,
  DEFAULT_RATE_BENCHMARKS,
};

export default USFLaborMarketService;
