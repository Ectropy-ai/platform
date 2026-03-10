/**
 * ============================================================================
 * PROJECT DATA SERVICE
 * ============================================================================
 * Provides real data from Prisma models to replace mock dashboard data.
 * Maps M3 Decision Lifecycle models to dashboard component expectations.
 *
 * Data Sources:
 * - PMDecision → Engineer tasks
 * - VoxelAlert → Structural alerts
 * - Voxel/USFWorkPacket → Construction tasks
 * - Participant → Crew members
 * - Voxel (aggregated) → Budget items
 * - AuditLog → Activity feed
 *
 * @module api-gateway/services
 * @version 1.0.0
 * ============================================================================
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Engineering task (from PMDecision)
 */
export interface EngineeringTask {
  id: string;
  task: string;
  status: 'completed' | 'in_progress' | 'pending';
  priority: 'high' | 'medium' | 'low';
  decisionId?: string;
  authorityLevel?: number;
}

/**
 * Structural alert (from VoxelAlert)
 */
export interface StructuralAlert {
  id: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  element: string;
  title?: string;
  createdAt?: string;
}

/**
 * Construction task (from Voxel/USFWorkPacket)
 */
export interface ConstructionTask {
  id: string;
  task: string;
  status: 'completed' | 'in_progress' | 'pending';
  crew: string;
  deadline: string;
  progress: number;
  zone?: string;
  building?: string;
}

/**
 * Crew member (from Participant)
 */
export interface CrewMember {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'scheduled' | 'inactive';
  crew: string;
  email?: string;
  company?: string;
}

/**
 * Budget item (from Voxel aggregation)
 */
export interface BudgetItem {
  id: string;
  category: string;
  budgeted: number;
  actual: number;
  variance: number;
  status: 'completed' | 'in_progress' | 'pending';
}

/**
 * Activity item (from AuditLog)
 */
export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  timestamp: string;
  user?: string;
  details?: Record<string, unknown>;
}

/**
 * Engineering stats summary
 */
export interface EngineeringStats {
  activeAnalyses: number;
  completedCalculations: number;
  pendingApprovals: number;
  structuralAlerts: number;
}

/**
 * Contractor stats summary
 */
export interface ContractorStats {
  totalTasks: number;
  completedTasks: number;
  activeCrew: number;
  onSchedule: number;
  overallProgress: number;
}

/**
 * Budget summary
 */
export interface BudgetSummary {
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  projectProgress: number;
}

// ============================================================================
// PRISMA CLIENT
// ============================================================================

import { getPrismaClient } from '../database/prisma.js';

// Use shared Prisma Client singleton to prevent connection pool exhaustion
function getPrisma(): ReturnType<typeof getPrismaClient> {
  return getPrismaClient();
}

// ============================================================================
// ENGINEERING DATA (PMDecision, VoxelAlert)
// ============================================================================

/**
 * Gets engineering tasks from PMDecision model
 */
export async function getEngineeringTasks(
  projectId: string
): Promise<EngineeringTask[]> {
  const client = getPrisma();

  try {
    const decisions = await client.pMDecision.findMany({
      where: {
        project_id: projectId,
        // Focus on engineering-relevant decisions
        type: {
          in: ['APPROVAL', 'PROPOSAL', 'ESCALATION'],
        },
      },
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      take: 20,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return decisions.map((d: any) => ({
      id: d.id,
      task: d.title,
      status: mapDecisionStatus(d.status),
      priority: mapAuthorityToPriority(d.authority_required),
      decisionId: d.decision_id,
      authorityLevel: d.authority_required,
    }));
  } catch (error) {
    logger.error('[ProjectData] Failed to get engineering tasks', {
      error,
      projectId,
    });
    return [];
  }
}

/**
 * Gets structural alerts from VoxelAlert model
 */
export async function getStructuralAlerts(
  projectId: string
): Promise<StructuralAlert[]> {
  const client = getPrisma();

  try {
    const alerts = await client.voxelAlert.findMany({
      where: {
        voxel: {
          project_id: projectId,
        },
        // Only active alerts (not expired)
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
      include: {
        voxel: {
          select: {
            voxel_id: true,
            zone: true,
            building: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
      take: 10,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return alerts.map((a: any) => ({
      id: a.id,
      message: a.message,
      severity: mapAlertPriority(a.priority),
      element: a.voxel.voxel_id,
      title: a.title,
      createdAt: a.created_at.toISOString(),
    }));
  } catch (error) {
    logger.error('[ProjectData] Failed to get structural alerts', {
      error,
      projectId,
    });
    return [];
  }
}

/**
 * Gets engineering stats summary
 */
export async function getEngineeringStats(
  projectId: string
): Promise<EngineeringStats> {
  const client = getPrisma();

  try {
    const [active, completed, pending, alertCount] = await Promise.all([
      client.pMDecision.count({
        where: {
          project_id: projectId,
          status: 'PENDING',
        },
      }),
      client.pMDecision.count({
        where: {
          project_id: projectId,
          status: 'APPROVED',
        },
      }),
      client.pMDecision.count({
        where: {
          project_id: projectId,
          escalation_required: true,
          status: { not: 'APPROVED' },
        },
      }),
      client.voxelAlert.count({
        where: {
          voxel: { project_id: projectId },
          OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        },
      }),
    ]);

    return {
      activeAnalyses: active,
      completedCalculations: completed,
      pendingApprovals: pending,
      structuralAlerts: alertCount,
    };
  } catch (error) {
    logger.error('[ProjectData] Failed to get engineering stats', {
      error,
      projectId,
    });
    return {
      activeAnalyses: 0,
      completedCalculations: 0,
      pendingApprovals: 0,
      structuralAlerts: 0,
    };
  }
}

// ============================================================================
// CONTRACTOR DATA (Voxel, USFWorkPacket, Participant)
// ============================================================================

/**
 * Gets construction tasks from Voxel model
 */
export async function getConstructionTasks(
  projectId: string
): Promise<ConstructionTask[]> {
  const client = getPrisma();

  try {
    const voxels = await client.voxel.findMany({
      where: {
        project_id: projectId,
        // Only voxels with work assignments
        current_phase: { not: null },
      },
      orderBy: [{ is_critical_path: 'desc' }, { planned_start: 'asc' }],
      take: 20,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return voxels.map((v: any) => ({
      id: v.id,
      task: `${v.current_phase || 'Work'} - ${v.zone || v.building || v.voxel_id}`,
      status: mapVoxelStatus(v.status),
      crew: v.system || 'General',
      deadline: v.planned_end?.toISOString().split('T')[0] || 'TBD',
      progress: v.percent_complete || 0,
      zone: v.zone || undefined,
      building: v.building || undefined,
    }));
  } catch (error) {
    logger.error('[ProjectData] Failed to get construction tasks', {
      error,
      projectId,
    });
    return [];
  }
}

/**
 * Gets crew members from Participant model
 */
export async function getCrewMembers(projectId: string): Promise<CrewMember[]> {
  const client = getPrisma();

  try {
    const participants = await client.participant.findMany({
      where: {
        project_id: projectId,
      },
      include: {
        authority_level: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
      take: 20,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return participants.map((p: any) => ({
      id: p.id,
      name: p.name,
      role: p.authority_level?.name || p.trade || 'Team Member',
      status: p.is_active ? 'active' : 'inactive',
      crew: p.trade || p.company || 'General',
      email: p.email || undefined,
      company: p.company || undefined,
    }));
  } catch (error) {
    logger.error('[ProjectData] Failed to get crew members', {
      error,
      projectId,
    });
    return [];
  }
}

/**
 * Gets contractor stats summary
 */
export async function getContractorStats(
  projectId: string
): Promise<ContractorStats> {
  const client = getPrisma();

  try {
    const [total, completed, activeCrew, voxels] = await Promise.all([
      client.voxel.count({
        where: {
          project_id: projectId,
          current_phase: { not: null },
        },
      }),
      client.voxel.count({
        where: {
          project_id: projectId,
          status: 'COMPLETE',
        },
      }),
      client.participant.count({
        where: {
          project_id: projectId,
          is_active: true,
        },
      }),
      client.voxel.findMany({
        where: { project_id: projectId },
        select: { percent_complete: true },
      }),
    ]);

    // Calculate overall progress
    const totalProgress = voxels.reduce(
      (sum: number, v: { percent_complete: number | null }) =>
        sum + (v.percent_complete || 0),
      0
    );
    const overallProgress =
      voxels.length > 0 ? Math.round(totalProgress / voxels.length) : 0;

    // Count on-schedule tasks (planned_end >= actual progress)
    const onSchedule = await client.voxel.count({
      where: {
        project_id: projectId,
        OR: [{ planned_end: null }, { planned_end: { gte: new Date() } }],
        status: { not: 'COMPLETE' },
      },
    });

    return {
      totalTasks: total,
      completedTasks: completed,
      activeCrew: activeCrew,
      onSchedule: onSchedule,
      overallProgress: overallProgress,
    };
  } catch (error) {
    logger.error('[ProjectData] Failed to get contractor stats', {
      error,
      projectId,
    });
    return {
      totalTasks: 0,
      completedTasks: 0,
      activeCrew: 0,
      onSchedule: 0,
      overallProgress: 0,
    };
  }
}

// ============================================================================
// OWNER DATA (Budget from Voxel aggregation)
// ============================================================================

/**
 * Gets budget items aggregated from Voxel costs
 */
export async function getBudgetItems(projectId: string): Promise<BudgetItem[]> {
  const client = getPrisma();

  try {
    // Aggregate costs by building/zone
    const voxels = await client.voxel.groupBy({
      by: ['building'],
      where: {
        project_id: projectId,
      },
      _sum: {
        estimated_cost: true,
        actual_cost: true,
      },
      _count: {
        id: true,
      },
    });

    // Also get completion status per building
    const statusByBuilding = await client.voxel.groupBy({
      by: ['building', 'status'],
      where: {
        project_id: projectId,
      },
      _count: {
        id: true,
      },
    });

    // Build status map
    const statusMap = new Map<string, { completed: number; total: number }>();
    for (const s of statusByBuilding) {
      const building = s.building || 'General';
      const current = statusMap.get(building) || { completed: 0, total: 0 };
      current.total += s._count.id;
      if (s.status === 'COMPLETE') {
        current.completed += s._count.id;
      }
      statusMap.set(building, current);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return voxels.map((v: any, index: number) => {
      const budgeted = Number(v._sum.estimated_cost || 0);
      const actual = Number(v._sum.actual_cost || 0);
      const category = v.building || 'General';
      const statusInfo = statusMap.get(category) || { completed: 0, total: 1 };

      // Determine status based on completion ratio
      let status: 'completed' | 'in_progress' | 'pending';
      if (statusInfo.completed === statusInfo.total) {
        status = 'completed';
      } else if (statusInfo.completed > 0) {
        status = 'in_progress';
      } else {
        status = 'pending';
      }

      return {
        id: `budget-${index}`,
        category: category,
        budgeted: budgeted,
        actual: actual,
        variance: actual - budgeted,
        status: status,
      };
    });
  } catch (error) {
    logger.error('[ProjectData] Failed to get budget items', {
      error,
      projectId,
    });
    return [];
  }
}

/**
 * Gets budget summary
 */
export async function getBudgetSummary(
  projectId: string
): Promise<BudgetSummary> {
  const client = getPrisma();

  try {
    const totals = await client.voxel.aggregate({
      where: { project_id: projectId },
      _sum: {
        estimated_cost: true,
        actual_cost: true,
      },
    });

    const voxels = await client.voxel.findMany({
      where: { project_id: projectId },
      select: { percent_complete: true },
    });

    const totalBudget = Number(totals._sum.estimated_cost || 0);
    const totalActual = Number(totals._sum.actual_cost || 0);
    const totalProgress = voxels.reduce(
      (sum: number, v: { percent_complete: number | null }) =>
        sum + (v.percent_complete || 0),
      0
    );
    const projectProgress =
      voxels.length > 0 ? Math.round(totalProgress / voxels.length) : 0;

    return {
      totalBudget: totalBudget,
      totalActual: totalActual,
      totalVariance: totalActual - totalBudget,
      projectProgress: projectProgress,
    };
  } catch (error) {
    logger.error('[ProjectData] Failed to get budget summary', {
      error,
      projectId,
    });
    return {
      totalBudget: 0,
      totalActual: 0,
      totalVariance: 0,
      projectProgress: 0,
    };
  }
}

// ============================================================================
// ACTIVITY DATA (AuditLog)
// ============================================================================

/**
 * Gets recent activities from AuditLog
 */
export async function getActivities(
  projectId: string,
  limit: number = 10
): Promise<ActivityItem[]> {
  const client = getPrisma();

  try {
    // Note: AuditLog doesn't have direct project_id, uses resource_id
    const logs = await client.auditLog.findMany({
      where: {
        resource_id: projectId,
      },
      orderBy: {
        created_at: 'desc',
      },
      take: limit,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return logs.map((log: any) => ({
      id: log.id.toString(),
      action: log.event_type,
      entityType: log.resource_type,
      timestamp: log.created_at.toISOString(),
      user: log.actor_id,
      details: log.event_data as Record<string, unknown>,
    }));
  } catch (error) {
    logger.error('[ProjectData] Failed to get activities', {
      error,
      projectId,
    });
    return [];
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Maps PMDecision status to dashboard task status
 */
function mapDecisionStatus(
  status: string
): 'completed' | 'in_progress' | 'pending' {
  switch (status) {
    case 'APPROVED':
    case 'IMPLEMENTED':
    case 'CLOSED':
      return 'completed';
    case 'REVIEW':
    case 'PENDING':
      return 'in_progress';
    case 'DRAFT':
    case 'REJECTED':
    case 'DEFERRED':
    default:
      return 'pending';
  }
}

/**
 * Maps authority level to priority
 */
function mapAuthorityToPriority(level: number): 'high' | 'medium' | 'low' {
  if (level >= 4) return 'high';
  if (level >= 2) return 'medium';
  return 'low';
}

/**
 * Maps VoxelAlert priority to severity
 */
function mapAlertPriority(priority: string): 'error' | 'warning' | 'info' {
  switch (priority) {
    case 'CRITICAL':
    case 'HIGH':
      return 'error';
    case 'MEDIUM':
      return 'warning';
    case 'LOW':
    case 'INFO':
    default:
      return 'info';
  }
}

/**
 * Maps Voxel status to task status
 */
function mapVoxelStatus(
  status: string
): 'completed' | 'in_progress' | 'pending' {
  switch (status) {
    case 'COMPLETED':
    case 'VERIFIED':
      return 'completed';
    case 'ACTIVE':
    case 'IN_PROGRESS':
      return 'in_progress';
    case 'PLANNED':
    case 'BLOCKED':
    case 'ON_HOLD':
    default:
      return 'pending';
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cleanup Prisma client connection
 * Note: Using shared singleton - disconnect handled by main application lifecycle
 */
export async function cleanup(): Promise<void> {
  // No-op: Shared Prisma Client singleton is managed at application level
  // Use disconnectPrisma() from prisma.ts for graceful shutdown
  logger.info(
    'project-data.service cleanup called (using shared Prisma singleton)'
  );
}
