/**
 * Decision Surface Service
 *
 * Enterprise-grade service for managing the decision surface on voxels.
 * Implements full V3 schema compliance including:
 * - Attached decisions with metadata
 * - Tolerance overrides (10 types)
 * - Pre-approvals with authority levels
 * - Alerts with priority-based notifications
 * - Worker acknowledgments with location tracking
 *
 * The decision surface is the queryable overlay of decisions on the BIM model,
 * allowing users to see decision density, consequence chains, and authority
 * routing at any spatial location.
 *
 * @see .roadmap/schemas/voxel/voxel-v3.schema.json
 * @see .roadmap/architecture/voxel-ml-architecture.json
 * @module services/decision-surface
 * @version 1.0.0
 */

import { randomUUID } from 'crypto';
import {
  VoxelData,
  VoxelDataV3,
  DecisionSurface,
  AttachedDecision,
  DecisionAttachmentType,
  AttachedByType,
  ToleranceOverride,
  ToleranceType,
  ToleranceValue,
  PreApproval,
  AuthorityLevel,
  VoxelAlert,
  AlertPriority,
  DecisionAcknowledgment,
  AcknowledgmentMethod,
  VoxelSystem,
} from '../types/voxel-decomposition.types.js';
import { AuthorityLevel as AuthorityLevelEnum } from '../types/pm.types.js';
import {
  DecisionAuthorityCascadeService,
  createDecisionAuthorityCascadeService,
  DecisionImpact,
  AuthorityRoutingResult,
} from './decision-authority-cascade.service.js';

// ==============================================================================
// Types
// ==============================================================================

/**
 * Decision attachment input
 */
export interface AttachDecisionInput {
  decisionRef: string; // URN
  voxelId: string;
  attachmentType: DecisionAttachmentType;
  attachedBy: AttachedByType;
  affectedTrades?: string[];
  summary?: string;
  requiresAcknowledgment?: boolean;
}

/**
 * Tolerance override input
 */
export interface CreateToleranceOverrideInput {
  voxelId: string;
  toleranceType: ToleranceType;
  standardValue: ToleranceValue;
  approvedValue: ToleranceValue;
  sourceDecisionRef: string; // URN
  approvedBy: string; // URN
  rationale: string;
  applicableTrades: string[];
  expiresAt?: Date;
}

/**
 * Pre-approval input
 */
export interface CreatePreApprovalInput {
  voxelId: string;
  scope: string;
  conditions: string[];
  sourceDecisionRef: string; // URN
  authorityLevel: AuthorityLevel;
  applicableTrades: string[];
  validFrom?: Date;
  validUntil?: Date;
}

/**
 * Alert creation input
 */
export interface CreateAlertInput {
  voxelId: string;
  priority: AlertPriority;
  title: string;
  message: string;
  sourceDecisionRef?: string; // URN
  targetTrades?: string[];
  requiresAcknowledgment?: boolean;
  expiresAt?: Date;
}

/**
 * Acknowledgment input
 */
export interface RecordAcknowledgmentInput {
  decisionRef: string; // URN
  voxelId: string;
  workerRef: string; // URN
  workerName: string;
  workerTrade: string;
  method: AcknowledgmentMethod;
  location?: {
    gps?: { lat: number; lng: number; accuracy: number };
    uwb?: { x: number; y: number; z: number; accuracy: number };
  };
  notes?: string;
}

/**
 * Decision surface query options
 */
export interface DecisionSurfaceQueryOptions {
  includeExpired?: boolean;
  filterByTrade?: string;
  filterByPriority?: AlertPriority;
  onlyUnacknowledged?: boolean;
}

/**
 * Decision surface statistics
 */
export interface DecisionSurfaceStats {
  totalDecisions: number;
  unacknowledgedCount: number;
  activeAlerts: number;
  criticalAlerts: number;
  toleranceOverrides: number;
  preApprovals: number;
  acknowledgmentRate: number;
}

// ==============================================================================
// Service Class
// ==============================================================================

/**
 * Decision Surface Service
 *
 * Manages the complete decision surface on voxels per V3 schema.
 */
export class DecisionSurfaceService {
  private authorityCascade: DecisionAuthorityCascadeService;
  private decisionSurfaces: Map<string, DecisionSurface>; // voxelId -> surface

  constructor(authorityCascade?: DecisionAuthorityCascadeService) {
    this.authorityCascade =
      authorityCascade || createDecisionAuthorityCascadeService();
    this.decisionSurfaces = new Map();
  }

  // ===========================================================================
  // Decision Surface Management
  // ===========================================================================

  /**
   * Get or create decision surface for a voxel
   */
  getDecisionSurface(voxelId: string): DecisionSurface {
    let surface = this.decisionSurfaces.get(voxelId);
    if (!surface) {
      surface = this.createEmptyDecisionSurface();
      this.decisionSurfaces.set(voxelId, surface);
    }
    return surface;
  }

  /**
   * Create empty decision surface
   */
  private createEmptyDecisionSurface(): DecisionSurface {
    return {
      decisions: [],
      attachedDecisions: [],
      toleranceOverrides: [],
      preApprovals: [],
      activeAlerts: [],
      acknowledgments: [],
      decisionCount: 0,
      unacknowledgedCount: 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Apply decision surface to voxel (V3 upgrade)
   */
  applyDecisionSurfaceToVoxel(voxel: VoxelData): VoxelDataV3 {
    const surface = this.getDecisionSurface(voxel.id);
    return {
      ...voxel,
      $schema: 'https://luhtech.dev/schemas/pm/voxel.schema.json',
      schemaVersion: '3.0.0',
      decisionSurface: surface,
      graphMetadata: voxel.graphMetadata || { inEdges: [], outEdges: [] },
    };
  }

  // ===========================================================================
  // Decision Attachment
  // ===========================================================================

  /**
   * Attach a decision to a voxel
   */
  attachDecision(input: AttachDecisionInput): AttachedDecision {
    const surface = this.getDecisionSurface(input.voxelId);

    const attachment: AttachedDecision = {
      decisionRef: input.decisionRef,
      attachmentType: input.attachmentType,
      attachedAt: new Date(),
      attachedBy: input.attachedBy,
      affectedTrades: input.affectedTrades,
      summary: input.summary,
      requiresAcknowledgment: input.requiresAcknowledgment || false,
      acknowledged: false,
    };

    // Add to surface
    surface.attachedDecisions.push(attachment);
    if (!surface.decisions.includes(input.decisionRef)) {
      surface.decisions.push(input.decisionRef);
    }

    // Update counts
    surface.decisionCount = surface.decisions.length;
    if (input.requiresAcknowledgment) {
      surface.unacknowledgedCount++;
    }
    surface.lastUpdated = new Date();

    return attachment;
  }

  /**
   * Get all attached decisions for a voxel
   */
  getAttachedDecisions(
    voxelId: string,
    options?: DecisionSurfaceQueryOptions
  ): AttachedDecision[] {
    const surface = this.getDecisionSurface(voxelId);
    let decisions = [...surface.attachedDecisions];

    if (options?.filterByTrade) {
      decisions = decisions.filter((d) =>
        d.affectedTrades?.includes(options.filterByTrade!)
      );
    }

    if (options?.onlyUnacknowledged) {
      decisions = decisions.filter(
        (d) => d.requiresAcknowledgment && !d.acknowledged
      );
    }

    return decisions;
  }

  /**
   * Detach a decision from a voxel
   */
  detachDecision(voxelId: string, decisionRef: string): boolean {
    const surface = this.getDecisionSurface(voxelId);

    const index = surface.attachedDecisions.findIndex(
      (d) => d.decisionRef === decisionRef
    );
    if (index < 0) {return false;}

    const attachment = surface.attachedDecisions[index];
    surface.attachedDecisions.splice(index, 1);

    // Update decision list
    surface.decisions = surface.decisions.filter((d) => d !== decisionRef);

    // Update counts
    surface.decisionCount = surface.decisions.length;
    if (attachment.requiresAcknowledgment && !attachment.acknowledged) {
      surface.unacknowledgedCount = Math.max(
        0,
        surface.unacknowledgedCount - 1
      );
    }
    surface.lastUpdated = new Date();

    return true;
  }

  // ===========================================================================
  // Tolerance Overrides
  // ===========================================================================

  /**
   * Create a tolerance override at a voxel
   */
  createToleranceOverride(
    input: CreateToleranceOverrideInput
  ): ToleranceOverride {
    const surface = this.getDecisionSurface(input.voxelId);

    const override: ToleranceOverride = {
      id: `tol-${randomUUID().slice(0, 8)}`,
      toleranceType: input.toleranceType,
      standardValue: input.standardValue,
      approvedValue: input.approvedValue,
      sourceDecisionRef: input.sourceDecisionRef,
      approvedBy: input.approvedBy,
      approvalDate: new Date(),
      expiresAt: input.expiresAt,
      rationale: input.rationale,
      applicableTrades: input.applicableTrades,
    };

    surface.toleranceOverrides.push(override);
    surface.lastUpdated = new Date();

    return override;
  }

  /**
   * Get active tolerance overrides for a voxel
   */
  getToleranceOverrides(
    voxelId: string,
    options?: { toleranceType?: ToleranceType; trade?: string }
  ): ToleranceOverride[] {
    const surface = this.getDecisionSurface(voxelId);
    const now = new Date();

    let overrides = surface.toleranceOverrides.filter(
      (o) => !o.expiresAt || o.expiresAt > now
    );

    if (options?.toleranceType) {
      overrides = overrides.filter(
        (o) => o.toleranceType === options.toleranceType
      );
    }

    if (options?.trade) {
      overrides = overrides.filter((o) =>
        o.applicableTrades.includes(options.trade!)
      );
    }

    return overrides;
  }

  /**
   * Check if a variance is within approved tolerance
   */
  isWithinApprovedTolerance(
    voxelId: string,
    toleranceType: ToleranceType,
    actualValue: number,
    trade?: string
  ): { withinTolerance: boolean; override?: ToleranceOverride } {
    const overrides = this.getToleranceOverrides(voxelId, {
      toleranceType,
      trade,
    });

    for (const override of overrides) {
      const approved = override.approvedValue.value;
      const direction = override.approvedValue.direction;

      let withinTolerance = false;
      switch (direction) {
        case '+':
          withinTolerance = actualValue <= approved;
          break;
        case '-':
          withinTolerance = actualValue >= -approved;
          break;
        case '±':
          withinTolerance = Math.abs(actualValue) <= approved;
          break;
      }

      if (withinTolerance) {
        return { withinTolerance: true, override };
      }
    }

    return { withinTolerance: false };
  }

  /**
   * Revoke a tolerance override
   */
  revokeToleranceOverride(voxelId: string, overrideId: string): boolean {
    const surface = this.getDecisionSurface(voxelId);
    const index = surface.toleranceOverrides.findIndex(
      (o) => o.id === overrideId
    );

    if (index >= 0) {
      surface.toleranceOverrides.splice(index, 1);
      surface.lastUpdated = new Date();
      return true;
    }
    return false;
  }

  // ===========================================================================
  // Pre-Approvals
  // ===========================================================================

  /**
   * Create a pre-approval at a voxel
   */
  createPreApproval(input: CreatePreApprovalInput): PreApproval {
    const surface = this.getDecisionSurface(input.voxelId);

    const preApproval: PreApproval = {
      id: `pre-${randomUUID().slice(0, 8)}`,
      scope: input.scope,
      conditions: input.conditions,
      validFrom: input.validFrom || new Date(),
      validUntil: input.validUntil,
      sourceDecisionRef: input.sourceDecisionRef,
      authorityLevel: input.authorityLevel,
      applicableTrades: input.applicableTrades,
      usageCount: 0,
    };

    surface.preApprovals.push(preApproval);
    surface.lastUpdated = new Date();

    return preApproval;
  }

  /**
   * Get active pre-approvals for a voxel
   */
  getPreApprovals(
    voxelId: string,
    options?: { trade?: string; authorityLevel?: AuthorityLevel }
  ): PreApproval[] {
    const surface = this.getDecisionSurface(voxelId);
    const now = new Date();

    let preApprovals = surface.preApprovals.filter(
      (p) => p.validFrom <= now && (!p.validUntil || p.validUntil > now)
    );

    if (options?.trade) {
      preApprovals = preApprovals.filter((p) =>
        p.applicableTrades.includes(options.trade!)
      );
    }

    if (options?.authorityLevel) {
      preApprovals = preApprovals.filter(
        (p) => p.authorityLevel === options.authorityLevel
      );
    }

    return preApprovals;
  }

  /**
   * Check if an action is covered by a pre-approval
   */
  checkPreApproval(
    voxelId: string,
    scope: string,
    trade: string,
    requiredLevel: AuthorityLevel
  ): { covered: boolean; preApproval?: PreApproval } {
    const preApprovals = this.getPreApprovals(voxelId, { trade });

    for (const preApproval of preApprovals) {
      // Check scope match
      if (!preApproval.scope.includes(scope)) {continue;}

      // Convert string authority level to enum for cascade service lookup
      const preApprovalEnum = AuthorityLevelEnum[preApproval.authorityLevel as keyof typeof AuthorityLevelEnum];
      const requiredEnum = AuthorityLevelEnum[requiredLevel as keyof typeof AuthorityLevelEnum];

      // Check authority level is sufficient
      const preApprovalLevelNum = preApprovalEnum
        ? this.authorityCascade.getTierByName(preApprovalEnum)?.level
        : undefined;
      const requiredLevelNum = requiredEnum
        ? this.authorityCascade.getTierByName(requiredEnum)?.level
        : undefined;

      if (
        preApprovalLevelNum !== undefined &&
        requiredLevelNum !== undefined &&
        preApprovalLevelNum >= requiredLevelNum
      ) {
        // Increment usage count
        preApproval.usageCount++;
        return { covered: true, preApproval };
      }
    }

    return { covered: false };
  }

  // ===========================================================================
  // Alerts
  // ===========================================================================

  /**
   * Create an alert at a voxel
   */
  createAlert(input: CreateAlertInput): VoxelAlert {
    const surface = this.getDecisionSurface(input.voxelId);

    const alert: VoxelAlert = {
      id: `alert-${randomUUID().slice(0, 8)}`,
      priority: input.priority,
      title: input.title,
      message: input.message,
      sourceDecisionRef: input.sourceDecisionRef,
      targetTrades: input.targetTrades,
      requiresAcknowledgment: input.requiresAcknowledgment || false,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      acknowledgedBy: [],
    };

    surface.activeAlerts.push(alert);
    surface.lastUpdated = new Date();

    return alert;
  }

  /**
   * Get active alerts for a voxel
   */
  getActiveAlerts(
    voxelId: string,
    options?: DecisionSurfaceQueryOptions
  ): VoxelAlert[] {
    const surface = this.getDecisionSurface(voxelId);
    const now = new Date();

    let alerts = options?.includeExpired
      ? [...surface.activeAlerts]
      : surface.activeAlerts.filter((a) => !a.expiresAt || a.expiresAt > now);

    if (options?.filterByTrade) {
      alerts = alerts.filter(
        (a) =>
          !a.targetTrades ||
          a.targetTrades.length === 0 ||
          a.targetTrades.includes(options.filterByTrade!)
      );
    }

    if (options?.filterByPriority) {
      alerts = alerts.filter((a) => a.priority === options.filterByPriority);
    }

    return alerts;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(
    voxelId: string,
    alertId: string,
    workerRef: string
  ): boolean {
    const surface = this.getDecisionSurface(voxelId);
    const alert = surface.activeAlerts.find((a) => a.id === alertId);

    if (alert && !alert.acknowledgedBy.includes(workerRef)) {
      alert.acknowledgedBy.push(workerRef);
      surface.lastUpdated = new Date();
      return true;
    }

    return false;
  }

  /**
   * Dismiss an alert
   */
  dismissAlert(voxelId: string, alertId: string): boolean {
    const surface = this.getDecisionSurface(voxelId);
    const index = surface.activeAlerts.findIndex((a) => a.id === alertId);

    if (index >= 0) {
      surface.activeAlerts.splice(index, 1);
      surface.lastUpdated = new Date();
      return true;
    }

    return false;
  }

  // ===========================================================================
  // Worker Acknowledgments
  // ===========================================================================

  /**
   * Record a worker acknowledgment of a decision
   */
  recordAcknowledgment(input: RecordAcknowledgmentInput): DecisionAcknowledgment {
    const surface = this.getDecisionSurface(input.voxelId);

    const acknowledgment: DecisionAcknowledgment = {
      id: `ack-${randomUUID().slice(0, 8)}`,
      decisionRef: input.decisionRef,
      workerRef: input.workerRef,
      workerName: input.workerName,
      workerTrade: input.workerTrade,
      timestamp: new Date(),
      method: input.method,
      location: input.location,
      notes: input.notes,
    };

    surface.acknowledgments.push(acknowledgment);

    // Update attached decision acknowledged status
    const attachedDecision = surface.attachedDecisions.find(
      (d) => d.decisionRef === input.decisionRef
    );
    if (attachedDecision && !attachedDecision.acknowledged) {
      attachedDecision.acknowledged = true;
      surface.unacknowledgedCount = Math.max(
        0,
        surface.unacknowledgedCount - 1
      );
    }

    surface.lastUpdated = new Date();

    return acknowledgment;
  }

  /**
   * Get acknowledgments for a voxel
   */
  getAcknowledgments(
    voxelId: string,
    decisionRef?: string
  ): DecisionAcknowledgment[] {
    const surface = this.getDecisionSurface(voxelId);

    if (decisionRef) {
      return surface.acknowledgments.filter(
        (a) => a.decisionRef === decisionRef
      );
    }

    return [...surface.acknowledgments];
  }

  /**
   * Check if a decision has been acknowledged by a specific worker
   */
  hasWorkerAcknowledged(
    voxelId: string,
    decisionRef: string,
    workerRef: string
  ): boolean {
    const acknowledgments = this.getAcknowledgments(voxelId, decisionRef);
    return acknowledgments.some((a) => a.workerRef === workerRef);
  }

  // ===========================================================================
  // Statistics & Queries
  // ===========================================================================

  /**
   * Get decision surface statistics for a voxel
   */
  getStats(voxelId: string): DecisionSurfaceStats {
    const surface = this.getDecisionSurface(voxelId);
    const now = new Date();

    const activeAlerts = surface.activeAlerts.filter(
      (a) => !a.expiresAt || a.expiresAt > now
    );
    const criticalAlerts = activeAlerts.filter(
      (a) => a.priority === 'CRITICAL'
    );
    const activeOverrides = surface.toleranceOverrides.filter(
      (o) => !o.expiresAt || o.expiresAt > now
    );
    const activePreApprovals = surface.preApprovals.filter(
      (p) => p.validFrom <= now && (!p.validUntil || p.validUntil > now)
    );

    const requiresAck = surface.attachedDecisions.filter(
      (d) => d.requiresAcknowledgment
    );
    const acknowledged = requiresAck.filter((d) => d.acknowledged);
    const acknowledgmentRate =
      requiresAck.length > 0 ? acknowledged.length / requiresAck.length : 1;

    return {
      totalDecisions: surface.decisionCount,
      unacknowledgedCount: surface.unacknowledgedCount,
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      toleranceOverrides: activeOverrides.length,
      preApprovals: activePreApprovals.length,
      acknowledgmentRate,
    };
  }

  /**
   * Find voxels with unacknowledged decisions
   */
  findVoxelsWithUnacknowledgedDecisions(): string[] {
    const voxelIds: string[] = [];
    for (const [voxelId, surface] of this.decisionSurfaces) {
      if (surface.unacknowledgedCount > 0) {
        voxelIds.push(voxelId);
      }
    }
    return voxelIds;
  }

  /**
   * Find voxels with critical alerts
   */
  findVoxelsWithCriticalAlerts(): string[] {
    const voxelIds: string[] = [];
    const now = new Date();

    for (const [voxelId, surface] of this.decisionSurfaces) {
      const hasCritical = surface.activeAlerts.some(
        (a) =>
          a.priority === 'CRITICAL' && (!a.expiresAt || a.expiresAt > now)
      );
      if (hasCritical) {
        voxelIds.push(voxelId);
      }
    }
    return voxelIds;
  }

  /**
   * Get decision density heat map data
   */
  getDecisionDensityMap(): Map<string, number> {
    const densityMap = new Map<string, number>();
    for (const [voxelId, surface] of this.decisionSurfaces) {
      densityMap.set(voxelId, surface.decisionCount);
    }
    return densityMap;
  }

  // ===========================================================================
  // Authority Integration
  // ===========================================================================

  /**
   * Route a decision through authority cascade and attach to voxel
   */
  routeAndAttachDecision(
    decisionRef: string,
    voxelId: string,
    impact: DecisionImpact,
    attachedBy: AttachedByType,
    summary?: string
  ): {
    attachment: AttachedDecision;
    routing: AuthorityRoutingResult;
  } {
    // Calculate authority routing
    const routing = this.authorityCascade.calculateRequiredAuthority(impact);

    // Determine if acknowledgment is required based on authority level
    const requiresAcknowledgment = routing.requiredLevelNumber >= 2; // SUPERINTENDENT+

    // Attach the decision
    const attachment = this.attachDecision({
      decisionRef,
      voxelId,
      attachmentType: 'PRIMARY',
      attachedBy,
      summary:
        summary ||
        `${routing.requiredTitle} decision - ${routing.recommendation}`,
      requiresAcknowledgment,
    });

    // Create alert if high authority required
    if (routing.requiredLevelNumber >= 3) {
      this.createAlert({
        voxelId,
        priority: routing.requiredLevelNumber >= 5 ? 'CRITICAL' : 'WARNING',
        title: `${routing.requiredTitle} Decision Required`,
        message: routing.recommendation,
        sourceDecisionRef: decisionRef,
        requiresAcknowledgment: true,
      });
    }

    return { attachment, routing };
  }

  // ===========================================================================
  // Persistence Helpers
  // ===========================================================================

  /**
   * Export decision surface for persistence
   */
  exportDecisionSurface(voxelId: string): DecisionSurface {
    return { ...this.getDecisionSurface(voxelId) };
  }

  /**
   * Import decision surface from persistence
   */
  importDecisionSurface(voxelId: string, surface: DecisionSurface): void {
    this.decisionSurfaces.set(voxelId, {
      ...surface,
      // Ensure dates are proper Date objects
      lastUpdated: new Date(surface.lastUpdated),
      attachedDecisions: surface.attachedDecisions.map((d) => ({
        ...d,
        attachedAt: new Date(d.attachedAt),
      })),
      toleranceOverrides: surface.toleranceOverrides.map((o) => ({
        ...o,
        approvalDate: new Date(o.approvalDate),
        expiresAt: o.expiresAt ? new Date(o.expiresAt) : undefined,
      })),
      preApprovals: surface.preApprovals.map((p) => ({
        ...p,
        validFrom: new Date(p.validFrom),
        validUntil: p.validUntil ? new Date(p.validUntil) : undefined,
      })),
      activeAlerts: surface.activeAlerts.map((a) => ({
        ...a,
        createdAt: new Date(a.createdAt),
        expiresAt: a.expiresAt ? new Date(a.expiresAt) : undefined,
      })),
      acknowledgments: surface.acknowledgments.map((a) => ({
        ...a,
        timestamp: new Date(a.timestamp),
      })),
    });
  }

  /**
   * Clear decision surface for a voxel
   */
  clearDecisionSurface(voxelId: string): void {
    this.decisionSurfaces.delete(voxelId);
  }

  /**
   * Get all voxel IDs with decision surfaces
   */
  getAllVoxelIdsWithSurfaces(): string[] {
    return Array.from(this.decisionSurfaces.keys());
  }
}

// ==============================================================================
// Factory Function
// ==============================================================================

/**
 * Create decision surface service
 */
export function createDecisionSurfaceService(
  authorityCascade?: DecisionAuthorityCascadeService
): DecisionSurfaceService {
  return new DecisionSurfaceService(authorityCascade);
}

export default DecisionSurfaceService;
