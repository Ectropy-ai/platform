/**
 * Voxel Persistence Service
 *
 * Enterprise-grade Prisma persistence layer for voxel data.
 * Handles CRUD operations, batch processing, and optimized queries.
 *
 * Features:
 * - Batch upsert for efficient voxel grid persistence
 * - Spatial queries with database-level indexing
 * - Transaction support for atomic updates
 * - Aggregation queries for metrics
 * - Decision attachment management
 * - Decision surface persistence (Phase 2)
 *
 * @module services/voxel-persistence
 * @version 1.1.0
 */

// UUID generation using Node.js crypto module
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: crypto module types resolved at build time
import * as crypto from 'crypto';

// Dynamic Prisma types - will be available after prisma generate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;
type PrismaVoxelStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETE' | 'ON_HOLD' | 'INSPECTION_REQUIRED' | 'BLOCKED' | 'ISSUE';

// Prisma namespace stub for type safety
namespace Prisma {
  export class Decimal {
    constructor(public value: number | string) { /* parameter property */ }
    toNumber(): number { return typeof this.value === 'number' ? this.value : parseFloat(this.value); }
  }
  export type JsonValue = any;
  export type JsonObject = Record<string, any>;
  export type VoxelWhereInput = any;
  export type VoxelCreateInput = any;
  export function raw(sql: string): any { return sql; }
}
import {
  VoxelData,
  VoxelSummary,
  VoxelStatus,
  VoxelSystem,
  VoxelHealthStatus,
  BoundingBox,
  Vector3,
  VoxelSpatialQuery,
  VoxelAggregation,
  AggregationLevel,
  VoxelActivityItem,
} from '../types/voxel-decomposition.types';

// ==============================================================================
// Types
// ==============================================================================

/**
 * Prisma Voxel record type
 */
type PrismaVoxel = {
  id: string;
  urn: string;
  project_id: string;
  voxel_id: string;
  status: PrismaVoxelStatus;
  coord_x: number;
  coord_y: number;
  coord_z: number;
  resolution: number;
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  min_z: number;
  max_z: number;
  building: string | null;
  level: string | null;
  zone: string | null;
  room: string | null;
  grid_reference: string | null;
  system: string | null;
  ifc_elements: string[];
  decision_count: number;
  unacknowledged_count: number;
  current_phase: string | null;
  percent_complete: number | null;
  planned_start: Date | null;
  planned_end: Date | null;
  actual_start: Date | null;
  actual_end: Date | null;
  is_critical_path: boolean;
  estimated_cost: Prisma.Decimal | null;
  actual_cost: Prisma.Decimal | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  graph_metadata: Prisma.JsonValue | null;
  meta: Prisma.JsonValue | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Result of batch persistence operation
 */
export interface VoxelPersistenceResult {
  success: boolean;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

/**
 * Decision attachment input
 */
export interface DecisionAttachmentInput {
  voxelId: string;
  decisionId: string;
  attachmentType: 'LOCATION' | 'IMPACT' | 'CONTEXT' | 'REFERENCE';
  label?: string;
  affectedTrades?: string[];
  summary?: string;
  requiresAcknowledgment?: boolean;
  attachedBy?: 'SYSTEM' | 'USER' | 'AI';
}

// ==============================================================================
// Status Mapping
// ==============================================================================

const statusToPrisma: Record<VoxelStatus, PrismaVoxelStatus> = {
  [VoxelStatus.PLANNED]: 'PLANNED',
  [VoxelStatus.IN_PROGRESS]: 'IN_PROGRESS',
  [VoxelStatus.COMPLETE]: 'COMPLETE',
  [VoxelStatus.ON_HOLD]: 'ON_HOLD',
  [VoxelStatus.INSPECTION_REQUIRED]: 'INSPECTION_REQUIRED',
  [VoxelStatus.BLOCKED]: 'BLOCKED',
  [VoxelStatus.ISSUE]: 'ISSUE',
};

const statusFromPrisma: Record<PrismaVoxelStatus, VoxelStatus> = {
  'PLANNED': VoxelStatus.PLANNED,
  'IN_PROGRESS': VoxelStatus.IN_PROGRESS,
  'COMPLETE': VoxelStatus.COMPLETE,
  'ON_HOLD': VoxelStatus.ON_HOLD,
  'INSPECTION_REQUIRED': VoxelStatus.INSPECTION_REQUIRED,
  'BLOCKED': VoxelStatus.BLOCKED,
  'ISSUE': VoxelStatus.ISSUE,
};

// ==============================================================================
// Transform Functions
// ==============================================================================

/**
 * Transform VoxelData to Prisma create input
 */
function voxelToPrismaCreate(voxel: VoxelData): Prisma.VoxelCreateInput {
  return {
    id: voxel.id,
    urn: voxel.urn,
    voxel_id: voxel.voxelId,
    status: statusToPrisma[voxel.status],
    coord_x: voxel.center.x,
    coord_y: voxel.center.y,
    coord_z: voxel.center.z,
    resolution: voxel.resolution,
    min_x: voxel.bounds.min.x,
    max_x: voxel.bounds.max.x,
    min_y: voxel.bounds.min.y,
    max_y: voxel.bounds.max.y,
    min_z: voxel.bounds.min.z,
    max_z: voxel.bounds.max.z,
    building: voxel.building,
    level: voxel.level,
    zone: voxel.zone,
    room: voxel.room,
    grid_reference: voxel.gridReference,
    system: voxel.system,
    ifc_elements: voxel.ifcElements,
    decision_count: voxel.decisionCount,
    unacknowledged_count: voxel.unacknowledgedCount,
    percent_complete: voxel.percentComplete,
    planned_start: voxel.plannedStart,
    planned_end: voxel.plannedEnd,
    actual_start: voxel.actualStart,
    actual_end: voxel.actualEnd,
    is_critical_path: voxel.isCriticalPath,
    estimated_cost: voxel.estimatedCost ? new Prisma.Decimal(voxel.estimatedCost) : null,
    actual_cost: voxel.actualCost ? new Prisma.Decimal(voxel.actualCost) : null,
    estimated_hours: voxel.estimatedHours,
    actual_hours: voxel.actualHours,
    graph_metadata: voxel.graphMetadata as Prisma.JsonObject,
    meta: voxel.meta as Prisma.JsonObject,
    project: {
      connect: { id: voxel.projectId },
    },
  };
}

/**
 * Transform Prisma record to VoxelData
 */
function prismaToVoxelData(record: PrismaVoxel): VoxelData {
  return {
    id: record.id,
    urn: record.urn,
    voxelId: record.voxel_id,
    projectId: record.project_id,
    coord: {
      i: Math.floor(record.coord_x / record.resolution),
      j: Math.floor(record.coord_y / record.resolution),
      k: Math.floor(record.coord_z / record.resolution),
    },
    center: {
      x: record.coord_x,
      y: record.coord_y,
      z: record.coord_z,
    },
    bounds: {
      min: { x: record.min_x, y: record.min_y, z: record.min_z },
      max: { x: record.max_x, y: record.max_y, z: record.max_z },
    },
    resolution: record.resolution,
    building: record.building || undefined,
    level: record.level || undefined,
    zone: record.zone || undefined,
    room: record.room || undefined,
    gridReference: record.grid_reference || undefined,
    system: (record.system as VoxelSystem) || VoxelSystem.UNKNOWN,
    ifcElements: record.ifc_elements,
    primaryElement: record.ifc_elements[0],
    elementCount: record.ifc_elements.length,
    status: statusFromPrisma[record.status],
    healthStatus: deriveHealthStatus(statusFromPrisma[record.status]),
    percentComplete: record.percent_complete || undefined,
    plannedStart: record.planned_start || undefined,
    plannedEnd: record.planned_end || undefined,
    actualStart: record.actual_start || undefined,
    actualEnd: record.actual_end || undefined,
    isCriticalPath: record.is_critical_path,
    estimatedCost: record.estimated_cost?.toNumber(),
    actualCost: record.actual_cost?.toNumber(),
    estimatedHours: record.estimated_hours || undefined,
    actualHours: record.actual_hours || undefined,
    decisionCount: record.decision_count,
    unacknowledgedCount: record.unacknowledged_count,
    graphMetadata: record.graph_metadata as { inEdges: string[]; outEdges: string[] } | undefined,
    meta: record.meta as Record<string, unknown> | undefined,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/**
 * Derive health status from voxel status
 */
function deriveHealthStatus(status: VoxelStatus): VoxelHealthStatus {
  switch (status) {
    case VoxelStatus.BLOCKED:
      return VoxelHealthStatus.BLOCKED;
    case VoxelStatus.ISSUE:
      return VoxelHealthStatus.CRITICAL;
    case VoxelStatus.INSPECTION_REQUIRED:
      return VoxelHealthStatus.AT_RISK;
    default:
      return VoxelHealthStatus.HEALTHY;
  }
}

// ==============================================================================
// Main Service Class
// ==============================================================================

/**
 * Voxel Persistence Service
 *
 * Provides enterprise-grade database operations for voxel data
 * using Prisma with optimized batch processing.
 */
export class VoxelPersistenceService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Persist voxels to database with batch upsert
   */
  async persistVoxels(
    projectId: string,
    voxels: VoxelData[]
  ): Promise<VoxelPersistenceResult> {
    const startTime = Date.now();
    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process in batches of 500 for efficiency
    const batchSize = 500;
    const batches: VoxelData[][] = [];
    for (let i = 0; i < voxels.length; i += batchSize) {
      batches.push(voxels.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      try {
        // Use transaction for atomic batch operations
        await this.prisma.$transaction(async (tx: any) => {
          for (const voxel of batch) {
            try {
              // Check if voxel exists
              const existing = await tx.voxel.findUnique({
                where: {
                  project_id_voxel_id: {
                    project_id: projectId,
                    voxel_id: voxel.voxelId,
                  },
                },
              });

              if (existing) {
                // Update existing
                await tx.voxel.update({
                  where: { id: existing.id },
                  data: {
                    coord_x: voxel.center.x,
                    coord_y: voxel.center.y,
                    coord_z: voxel.center.z,
                    min_x: voxel.bounds.min.x,
                    max_x: voxel.bounds.max.x,
                    min_y: voxel.bounds.min.y,
                    max_y: voxel.bounds.max.y,
                    min_z: voxel.bounds.min.z,
                    max_z: voxel.bounds.max.z,
                    ifc_elements: voxel.ifcElements,
                    system: voxel.system,
                    level: voxel.level,
                    meta: voxel.meta as Prisma.JsonObject,
                  },
                });
                updated++;
              } else {
                // Create new
                await tx.voxel.create({
                  data: voxelToPrismaCreate(voxel),
                });
                created++;
              }
            } catch (err) {
              failed++;
              errors.push(`Voxel ${voxel.voxelId}: ${err}`);
            }
          }
        });
      } catch (err) {
        failed += batch.length;
        errors.push(`Batch failed: ${err}`);
      }
    }

    return {
      success: failed === 0,
      created,
      updated,
      failed,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Load voxels from database for project
   */
  async loadProjectVoxels(projectId: string): Promise<VoxelData[]> {
    const records = await this.prisma.voxel.findMany({
      where: { project_id: projectId },
    });

    return records.map(prismaToVoxelData);
  }

  /**
   * Get voxel by ID
   */
  async getVoxel(voxelId: string): Promise<VoxelData | null> {
    const record = await this.prisma.voxel.findUnique({
      where: { id: voxelId },
    });

    return record ? prismaToVoxelData(record) : null;
  }

  /**
   * Get voxel by project and voxel_id
   */
  async getVoxelByVoxelId(projectId: string, voxelId: string): Promise<VoxelData | null> {
    const record = await this.prisma.voxel.findUnique({
      where: {
        project_id_voxel_id: {
          project_id: projectId,
          voxel_id: voxelId,
        },
      },
    });

    return record ? prismaToVoxelData(record) : null;
  }

  /**
   * Query voxels with spatial and property filters
   */
  async queryVoxels(query: VoxelSpatialQuery): Promise<{
    voxels: VoxelData[];
    totalCount: number;
  }> {
    const where: Prisma.VoxelWhereInput = {
      project_id: query.projectId,
    };

    // Bounding box filter
    if (query.boundingBox) {
      where.coord_x = {
        gte: query.boundingBox.min.x,
        lte: query.boundingBox.max.x,
      };
      where.coord_y = {
        gte: query.boundingBox.min.y,
        lte: query.boundingBox.max.y,
      };
      where.coord_z = {
        gte: query.boundingBox.min.z,
        lte: query.boundingBox.max.z,
      };
    }

    // System filter
    if (query.systems && query.systems.length > 0) {
      where.system = { in: query.systems };
    }

    // Status filter
    if (query.statuses && query.statuses.length > 0) {
      where.status = { in: query.statuses.map((s) => statusToPrisma[s]) };
    }

    // Level filter
    if (query.levels && query.levels.length > 0) {
      where.level = { in: query.levels };
    }

    // Zones filter
    if (query.zones && query.zones.length > 0) {
      where.zone = { in: query.zones };
    }

    // Decision filters
    if (query.hasDecisions === true) {
      where.decision_count = { gt: 0 };
    } else if (query.hasDecisions === false) {
      where.decision_count = 0;
    }

    if (query.hasActiveAlerts === true) {
      where.unacknowledged_count = { gt: 0 };
    } else if (query.hasActiveAlerts === false) {
      where.unacknowledged_count = 0;
    }

    // Execute count and query
    const [totalCount, records] = await Promise.all([
      this.prisma.voxel.count({ where }),
      this.prisma.voxel.findMany({
        where,
        skip: query.offset || 0,
        take: query.limit || 100,
        orderBy: [
          { level: 'asc' },
          { voxel_id: 'asc' },
        ],
      }),
    ]);

    return {
      voxels: records.map(prismaToVoxelData),
      totalCount,
    };
  }

  /**
   * Update voxel status
   */
  async updateVoxelStatus(
    voxelId: string,
    status: VoxelStatus,
    percentComplete?: number
  ): Promise<VoxelData | null> {
    try {
      const record = await this.prisma.voxel.update({
        where: { id: voxelId },
        data: {
          status: statusToPrisma[status],
          percent_complete: percentComplete,
          actual_start: status === VoxelStatus.IN_PROGRESS ? new Date() : undefined,
          actual_end: status === VoxelStatus.COMPLETE ? new Date() : undefined,
        },
      });

      return prismaToVoxelData(record);
    } catch {
      return null;
    }
  }

  /**
   * Attach decision to voxel
   */
  async attachDecision(input: DecisionAttachmentInput): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx: any) => {
        // Create attachment
        await tx.voxelDecisionAttachment.create({
          data: {
            voxel_id: input.voxelId,
            decision_id: input.decisionId,
            attachment_type: input.attachmentType,
            label: input.label,
            affected_trades: input.affectedTrades || [],
            summary: input.summary,
            requires_acknowledgment: input.requiresAcknowledgment ?? false,
            attached_by: input.attachedBy || 'SYSTEM',
          },
        });

        // Increment voxel decision count
        await tx.voxel.update({
          where: { id: input.voxelId },
          data: {
            decision_count: { increment: 1 },
            unacknowledged_count: input.requiresAcknowledgment
              ? { increment: 1 }
              : undefined,
          },
        });
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get aggregated metrics
   */
  async getAggregation(
    projectId: string,
    level: AggregationLevel
  ): Promise<VoxelAggregation[]> {
    // Determine group-by field
    let groupBy: string;
    switch (level) {
      case AggregationLevel.LEVEL:
        groupBy = 'level';
        break;
      case AggregationLevel.ZONE:
        groupBy = 'zone';
        break;
      case AggregationLevel.SYSTEM:
        groupBy = 'system';
        break;
      case AggregationLevel.BUILDING:
        groupBy = 'building';
        break;
      default:
        groupBy = 'project_id';
    }

    // Use raw SQL for aggregation
    const results = await this.prisma.$queryRaw<Array<{
      key: string | null;
      voxel_count: bigint;
      decision_count: bigint;
      alert_count: bigint;
      planned_count: bigint;
      in_progress_count: bigint;
      complete_count: bigint;
      blocked_count: bigint;
      total_estimated_cost: number | null;
      total_actual_cost: number | null;
      total_estimated_hours: number | null;
      total_actual_hours: number | null;
      avg_progress: number | null;
    }>>`
      SELECT
        ${Prisma.raw(groupBy)} as key,
        COUNT(*)::bigint as voxel_count,
        SUM(decision_count)::bigint as decision_count,
        SUM(unacknowledged_count)::bigint as alert_count,
        COUNT(*) FILTER (WHERE status = 'PLANNED')::bigint as planned_count,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::bigint as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'COMPLETE')::bigint as complete_count,
        COUNT(*) FILTER (WHERE status = 'BLOCKED')::bigint as blocked_count,
        SUM(estimated_cost)::numeric as total_estimated_cost,
        SUM(actual_cost)::numeric as total_actual_cost,
        SUM(estimated_hours) as total_estimated_hours,
        SUM(actual_hours) as total_actual_hours,
        AVG(percent_complete) as avg_progress
      FROM voxels
      WHERE project_id = ${projectId}::uuid
      GROUP BY ${Prisma.raw(groupBy)}
      ORDER BY ${Prisma.raw(groupBy)}
    `;

    return results.map((row: any) => ({
      level,
      key: row.key || 'Unknown',
      voxelCount: Number(row.voxel_count),
      elementCount: 0, // Would need join to calculate
      decisionCount: Number(row.decision_count),
      alertCount: Number(row.alert_count),
      plannedCount: Number(row.planned_count),
      inProgressCount: Number(row.in_progress_count),
      completeCount: Number(row.complete_count),
      blockedCount: Number(row.blocked_count),
      overallProgress: row.avg_progress || 0,
      totalEstimatedCost: row.total_estimated_cost || 0,
      totalActualCost: row.total_actual_cost || 0,
      costVariance: (row.total_actual_cost || 0) - (row.total_estimated_cost || 0),
      totalEstimatedHours: row.total_estimated_hours || 0,
      totalActualHours: row.total_actual_hours || 0,
      laborVariance: (row.total_actual_hours || 0) - (row.total_estimated_hours || 0),
      healthyCount: Number(row.voxel_count) - Number(row.blocked_count),
      atRiskCount: 0,
      criticalCount: Number(row.blocked_count),
      healthScore: 100 * (1 - Number(row.blocked_count) / Math.max(1, Number(row.voxel_count))),
    }));
  }

  /**
   * Get recent activity for voxels
   */
  async getVoxelActivity(
    projectId: string,
    limit: number = 50
  ): Promise<VoxelActivityItem[]> {
    // Get recent decision attachments and status changes
    const attachments = await this.prisma.voxelDecisionAttachment.findMany({
      where: {
        voxel: { project_id: projectId },
      },
      orderBy: { attached_at: 'desc' },
      take: limit,
      include: {
        voxel: { select: { voxel_id: true, coord_x: true, coord_y: true, coord_z: true, resolution: true } },
        decision: { select: { title: true } },
      },
    });

    return attachments.map((att: any) => ({
      id: att.id,
      voxelId: att.voxel_id,
      voxelLabel: att.voxel.voxel_id,
      type: 'decision' as const,
      title: `Decision attached: ${att.decision.title}`,
      description: att.summary || `Decision linked to voxel ${att.voxel.voxel_id}`,
      timestamp: att.attached_at,
      severity: att.requires_acknowledgment ? 'warning' as const : 'info' as const,
      coord: {
        i: Math.floor(att.voxel.coord_x / att.voxel.resolution),
        j: Math.floor(att.voxel.coord_y / att.voxel.resolution),
        k: Math.floor(att.voxel.coord_z / att.voxel.resolution),
      },
    }));
  }

  /**
   * Delete all voxels for a project
   */
  async deleteProjectVoxels(projectId: string): Promise<number> {
    const result = await this.prisma.voxel.deleteMany({
      where: { project_id: projectId },
    });
    return result.count;
  }

  /**
   * Get voxel count for project
   */
  async getVoxelCount(projectId: string): Promise<number> {
    return this.prisma.voxel.count({
      where: { project_id: projectId },
    });
  }

  // ===========================================================================
  // Decision Surface Persistence (Phase 2 Integration)
  // ===========================================================================

  /**
   * Create tolerance override for a voxel
   */
  async createToleranceOverride(input: {
    voxelId: string;
    toleranceType: string;
    standardValue: { value: number; unit: string; direction?: string };
    approvedValue: { value: number; unit: string; direction?: string };
    sourceDecisionUrn: string;
    approvedByUrn?: string;
    rationale?: string;
    applicableTrades?: string[];
    expiresAt?: Date;
  }): Promise<{ id: string; urn: string }> {
    const id = crypto.randomUUID();
    const urn = `urn:luhtech:tolerance:${id.slice(0, 8)}`;

    await this.prisma.toleranceOverride.create({
      data: {
        id,
        urn,
        voxel_id: input.voxelId,
        tolerance_type: input.toleranceType,
        standard_value: input.standardValue.value,
        standard_unit: input.standardValue.unit,
        standard_direction: input.standardValue.direction || '±',
        approved_value: input.approvedValue.value,
        approved_unit: input.approvedValue.unit,
        approved_direction: input.approvedValue.direction || '±',
        source_decision_urn: input.sourceDecisionUrn,
        approved_by_urn: input.approvedByUrn,
        rationale: input.rationale,
        applicable_trades: input.applicableTrades || [],
        approval_date: new Date(),
        expires_at: input.expiresAt,
      },
    });

    return { id, urn };
  }

  /**
   * Get tolerance overrides for a voxel
   */
  async getToleranceOverrides(voxelId: string, includeExpired = false): Promise<any[]> {
    const where: any = { voxel_id: voxelId };
    if (!includeExpired) {
      where.OR = [
        { expires_at: null },
        { expires_at: { gt: new Date() } },
      ];
    }
    return this.prisma.toleranceOverride.findMany({ where });
  }

  /**
   * Create pre-approval for a voxel
   */
  async createPreApproval(input: {
    voxelId: string;
    scope: string;
    conditions?: string[];
    authorityLevel: string;
    sourceDecisionUrn: string;
    applicableTrades?: string[];
    validFrom?: Date;
    validUntil?: Date;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();

    await this.prisma.preApproval.create({
      data: {
        id,
        voxel_id: input.voxelId,
        scope: input.scope,
        conditions: input.conditions || [],
        authority_level: input.authorityLevel,
        source_decision_urn: input.sourceDecisionUrn,
        applicable_trades: input.applicableTrades || [],
        valid_from: input.validFrom || new Date(),
        valid_until: input.validUntil,
      },
    });

    return { id };
  }

  /**
   * Get pre-approvals for a voxel
   */
  async getPreApprovals(voxelId: string, activeOnly = true): Promise<any[]> {
    const where: any = { voxel_id: voxelId };
    if (activeOnly) {
      where.OR = [
        { valid_until: null },
        { valid_until: { gt: new Date() } },
      ];
    }
    return this.prisma.preApproval.findMany({ where });
  }

  /**
   * Create alert for a voxel
   */
  async createAlert(input: {
    voxelId: string;
    priority: string;
    title: string;
    message: string;
    sourceDecisionUrn?: string;
    targetTrades?: string[];
    requiresAcknowledgment?: boolean;
    expiresAt?: Date;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();

    await this.prisma.voxelAlert.create({
      data: {
        id,
        voxel_id: input.voxelId,
        priority: input.priority,
        title: input.title,
        message: input.message,
        source_decision_urn: input.sourceDecisionUrn,
        target_trades: input.targetTrades || [],
        requires_acknowledgment: input.requiresAcknowledgment || false,
        expires_at: input.expiresAt,
      },
    });

    return { id };
  }

  /**
   * Get active alerts for a voxel
   */
  async getActiveAlerts(voxelId: string): Promise<any[]> {
    return this.prisma.voxelAlert.findMany({
      where: {
        voxel_id: voxelId,
        OR: [
          { expires_at: null },
          { expires_at: { gt: new Date() } },
        ],
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Record worker acknowledgment
   */
  async recordAcknowledgment(input: {
    decisionId: string;
    participantId: string;
    workerName?: string;
    workerTrade?: string;
    method: string;
    location?: {
      gps?: { lat: number; lng: number; accuracy: number };
      uwb?: { x: number; y: number; z: number; accuracy: number };
    };
    notes?: string;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();

    await this.prisma.acknowledgment.create({
      data: {
        id,
        decision_id: input.decisionId,
        participant_id: input.participantId,
        worker_name: input.workerName,
        worker_trade: input.workerTrade,
        method: input.method,
        gps_lat: input.location?.gps?.lat,
        gps_lng: input.location?.gps?.lng,
        gps_accuracy: input.location?.gps?.accuracy,
        uwb_x: input.location?.uwb?.x,
        uwb_y: input.location?.uwb?.y,
        uwb_z: input.location?.uwb?.z,
        uwb_accuracy: input.location?.uwb?.accuracy,
        notes: input.notes,
      },
    });

    // Update voxel unacknowledged count
    await this.prisma.$executeRaw`
      UPDATE voxels v
      SET unacknowledged_count = GREATEST(0, unacknowledged_count - 1)
      FROM voxel_decision_attachments vda
      WHERE vda.decision_id = ${input.decisionId}::uuid
        AND vda.voxel_id = v.id
        AND vda.requires_acknowledgment = true
    `;

    return { id };
  }

  /**
   * Get acknowledgments for a decision
   */
  async getAcknowledgments(decisionId: string): Promise<any[]> {
    return this.prisma.acknowledgment.findMany({
      where: { decision_id: decisionId },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Load full decision surface for a voxel
   * Hydrates from all related tables
   */
  async loadDecisionSurface(voxelId: string): Promise<{
    decisions: any[];
    toleranceOverrides: any[];
    preApprovals: any[];
    alerts: any[];
    decisionCount: number;
    unacknowledgedCount: number;
  }> {
    const [voxel, decisions, toleranceOverrides, preApprovals, alerts] = await Promise.all([
      this.prisma.voxel.findUnique({
        where: { id: voxelId },
        select: { decision_count: true, unacknowledged_count: true },
      }),
      this.prisma.voxelDecisionAttachment.findMany({
        where: { voxel_id: voxelId },
        include: { decision: true },
      }),
      this.getToleranceOverrides(voxelId),
      this.getPreApprovals(voxelId),
      this.getActiveAlerts(voxelId),
    ]);

    return {
      decisions,
      toleranceOverrides,
      preApprovals,
      alerts,
      decisionCount: voxel?.decision_count || 0,
      unacknowledgedCount: voxel?.unacknowledged_count || 0,
    };
  }

  /**
   * Get decisions attached to a voxel
   */
  async getVoxelDecisions(voxelId: string, filters?: {
    attachmentType?: string;
    requiresAcknowledgment?: boolean;
    acknowledged?: boolean;
    trades?: string[];
  }): Promise<any[]> {
    const where: any = { voxel_id: voxelId };

    if (filters?.attachmentType) {
      where.attachment_type = filters.attachmentType;
    }
    if (filters?.requiresAcknowledgment !== undefined) {
      where.requires_acknowledgment = filters.requiresAcknowledgment;
    }
    if (filters?.acknowledged !== undefined) {
      where.acknowledged = filters.acknowledged;
    }
    if (filters?.trades && filters.trades.length > 0) {
      where.affected_trades = { hasSome: filters.trades };
    }

    return this.prisma.voxelDecisionAttachment.findMany({
      where,
      include: { decision: true },
      orderBy: { attached_at: 'desc' },
    });
  }

  // ===========================================================================
  // Inspection Workflow Persistence (Phase 2 - Voxel Integration)
  // ===========================================================================

  /**
   * Create inspection request for voxels
   */
  async createInspection(input: {
    projectId: string;
    voxelIds: string[];
    inspectionType: string;
    requestedBy: string;
    priority?: string;
    title?: string;
    description?: string;
    scheduledDate?: Date;
    targetDate?: Date;
    notes?: string;
  }): Promise<{ id: string; urn: string; inspectionId: string }> {
    const id = crypto.randomUUID();
    // Generate sequential inspection ID for the project
    const count = await this.prisma.inspection.count({
      where: { project_id: input.projectId },
    });
    const inspectionId = `INSP-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const urn = `urn:luhtech:${input.projectId.slice(0, 8)}:inspection:${inspectionId}`;

    await this.prisma.inspection.create({
      data: {
        id,
        urn,
        project_id: input.projectId,
        inspection_id: inspectionId,
        inspection_type: input.inspectionType as any,
        status: 'SCHEDULED',
        title: input.title || `${input.inspectionType} Inspection`,
        description: input.description || input.notes,
        scheduled_date: input.scheduledDate || input.targetDate,
        meta: {
          requestedBy: input.requestedBy,
          priority: input.priority || 'NORMAL',
        },
        voxels: {
          connect: input.voxelIds.map(voxelId => ({ id: voxelId })),
        },
      },
    });

    // Update voxel statuses to INSPECTION_REQUIRED
    await this.prisma.voxel.updateMany({
      where: { id: { in: input.voxelIds } },
      data: { status: 'INSPECTION_REQUIRED' },
    });

    return { id, urn, inspectionId };
  }

  /**
   * Start an inspection (inspector on-site)
   */
  async startInspection(
    inspectionId: string,
    inspectorRef: string
  ): Promise<boolean> {
    try {
      await this.prisma.inspection.update({
        where: { id: inspectionId },
        data: {
          status: 'IN_PROGRESS',
          started_at: new Date(),
          inspector_info: { ref: inspectorRef, startedAt: new Date().toISOString() },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Complete an inspection with results
   */
  async completeInspection(input: {
    inspectionId: string;
    result: 'PASSED' | 'FAILED' | 'CONDITIONAL';
    inspectorRef: string;
    findings?: string;
    conditions?: string[];
    decisionsReviewed?: string[];
    decisionsValidated?: string[];
    decisionsFailed?: string[];
    punchListItems?: Array<{ item: string; severity: string }>;
    reinspectionRequired?: boolean;
    reinspectionDate?: Date;
  }): Promise<{
    success: boolean;
    voxelIds: string[];
    newStatus: string;
  }> {
    try {
      // Get the inspection with related voxels
      const inspection = await this.prisma.inspection.findUnique({
        where: { id: input.inspectionId },
        include: { voxels: true },
      });

      if (!inspection) {
        return { success: false, voxelIds: [], newStatus: '' };
      }

      // Determine voxel status based on result
      let voxelStatus: PrismaVoxelStatus;
      switch (input.result) {
        case 'PASSED':
          voxelStatus = 'COMPLETE';
          break;
        case 'FAILED':
          voxelStatus = 'ISSUE';
          break;
        case 'CONDITIONAL':
          voxelStatus = 'ON_HOLD';
          break;
        default:
          voxelStatus = 'ON_HOLD';
      }

      // Update inspection record
      await this.prisma.inspection.update({
        where: { id: input.inspectionId },
        data: {
          status: input.result,
          result_outcome: input.result,
          result_conditions: input.conditions || [],
          result_notes: input.findings,
          decisions_reviewed: input.decisionsReviewed || [],
          decisions_validated: input.decisionsValidated || [],
          decisions_failed: input.decisionsFailed || [],
          punch_list: input.punchListItems || [],
          reinspection_required: input.reinspectionRequired || false,
          reinspection_date: input.reinspectionDate,
          completed_at: new Date(),
          actual_date: new Date(),
          inspector_info: {
            ref: input.inspectorRef,
            completedAt: new Date().toISOString(),
          },
        },
      });

      // Update all linked voxels
      const voxelIds = inspection.voxels.map((v: any) => v.id);
      await this.prisma.voxel.updateMany({
        where: { id: { in: voxelIds } },
        data: {
          status: voxelStatus,
          actual_end: input.result === 'PASSED' ? new Date() : undefined,
          percent_complete: input.result === 'PASSED' ? 100 : undefined,
        },
      });

      // Create alert for failed inspections
      if (input.result === 'FAILED') {
        for (const voxelId of voxelIds) {
          await this.createAlert({
            voxelId,
            priority: 'HIGH',
            title: 'Inspection Failed',
            message: input.findings || 'Inspection failed - corrections required',
            requiresAcknowledgment: true,
          });
        }
      }

      return {
        success: true,
        voxelIds,
        newStatus: voxelStatus,
      };
    } catch {
      return { success: false, voxelIds: [], newStatus: '' };
    }
  }

  /**
   * Get inspection by ID
   */
  async getInspection(inspectionId: string): Promise<any | null> {
    return this.prisma.inspection.findUnique({
      where: { id: inspectionId },
      include: {
        voxels: true,
        validated_decisions: true,
        inspector: true,
      },
    });
  }

  /**
   * Get inspections for a voxel
   */
  async getVoxelInspections(voxelId: string): Promise<any[]> {
    const voxel = await this.prisma.voxel.findUnique({
      where: { id: voxelId },
      include: {
        inspections: {
          orderBy: { created_at: 'desc' },
        },
      },
    });
    return voxel?.inspections || [];
  }

  /**
   * Get pending inspections for project
   */
  async getPendingInspections(projectId: string): Promise<any[]> {
    return this.prisma.inspection.findMany({
      where: {
        project_id: projectId,
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
      },
      include: {
        voxels: {
          select: { id: true, voxel_id: true, level: true, zone: true },
        },
      },
      orderBy: { scheduled_date: 'asc' },
    });
  }
}

// ==============================================================================
// Factory Function
// ==============================================================================

/**
 * Create voxel persistence service
 */
export function createVoxelPersistenceService(
  prisma: PrismaClient
): VoxelPersistenceService {
  return new VoxelPersistenceService(prisma);
}

export default VoxelPersistenceService;
