/**
 * Demo Data Persistence Service
 *
 * ENTERPRISE DATA LAYER (Sprint 5 - 2026-01-24)
 *
 * Persists synthetic data from demo-scenarios generators to PostgreSQL.
 * This service takes the GeneratedRecords from DemoScenarioService.instantiateScenario()
 * and writes them to the database for live dashboard visualization.
 *
 * Features:
 * - Batch insert operations for performance
 * - Transaction support for data integrity
 * - Conflict handling (upsert patterns)
 * - Cleanup of previous demo data
 *
 * @module services/demo-persistence
 */

import type { Pool, PoolClient } from 'pg';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Generated records structure from DemoScenarioService
 */
export interface GeneratedRecords {
  users: unknown[];
  projects: unknown[];
  participants: unknown[];
  voxels: unknown[];
  decisions: unknown[];
  inspections: unknown[];
  consequences: unknown[];
  decisionEvents: unknown[];
  alerts: unknown[];
  acknowledgments: unknown[];
}

/**
 * Persistence result with counts and errors
 */
export interface PersistenceResult {
  success: boolean;
  projectId: string;
  counts: {
    users: number;
    projects: number;
    participants: number;
    voxels: number;
    decisions: number;
    inspections: number;
    alerts: number;
    auditLog: number;
  };
  errors: string[];
  warnings: string[];
}

// ============================================================================
// STATUS MAPPINGS
// ============================================================================

/**
 * Map demo-scenarios status to Prisma VoxelStatus enum
 */
const VOXEL_STATUS_MAP: Record<string, string> = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETE', // demo-scenarios uses COMPLETED, Prisma uses COMPLETE
  ON_HOLD: 'ON_HOLD',
  BLOCKED: 'BLOCKED',
};

/**
 * Map demo-scenarios decision status to Prisma DecisionStatus enum
 */
const DECISION_STATUS_MAP: Record<string, string> = {
  PENDING: 'PENDING',
  OPEN: 'OPEN',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CLOSED: 'CLOSED',
};

// ============================================================================
// PERSISTENCE SERVICE CLASS
// ============================================================================

export class DemoPersistenceService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Persist all generated records to the database
   */
  async persistGeneratedRecords(
    records: GeneratedRecords,
    options: {
      cleanupPrevious?: boolean;
      projectId?: string;
    } = {}
  ): Promise<PersistenceResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const counts = {
      users: 0,
      projects: 0,
      participants: 0,
      voxels: 0,
      decisions: 0,
      inspections: 0,
      alerts: 0,
      auditLog: 0,
    };

    const projectId = options.projectId || (records.projects[0] as any)?.id || 'demo-project';

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Optionally cleanup previous demo data
      if (options.cleanupPrevious) {
        await this.cleanupDemoData(client, projectId);
      }

      // Persist users
      counts.users = await this.persistUsers(client, records.users, warnings);

      // Persist projects
      counts.projects = await this.persistProjects(client, records.projects, warnings);

      // Persist project participants/roles
      counts.participants = await this.persistParticipants(client, records.participants, projectId, warnings);

      // Persist voxels
      counts.voxels = await this.persistVoxels(client, records.voxels, projectId, warnings);

      // Persist decisions
      counts.decisions = await this.persistDecisions(client, records.decisions, projectId, warnings);

      // Persist alerts
      counts.alerts = await this.persistAlerts(client, records.alerts, projectId, warnings);

      // Create audit log entries for the seeding
      counts.auditLog = await this.createAuditEntries(client, projectId, counts);

      await client.query('COMMIT');

      logger.info('[DemoPersistence] Records persisted successfully', {
        projectId,
        counts,
      });

      return {
        success: true,
        projectId,
        counts,
        errors,
        warnings,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      logger.error('[DemoPersistence] Failed to persist records', {
        error: errorMessage,
        projectId,
      });

      return {
        success: false,
        projectId,
        counts,
        errors,
        warnings,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Cleanup previous demo data for a project
   */
  private async cleanupDemoData(client: PoolClient, projectId: string): Promise<void> {
    logger.debug('[DemoPersistence] Cleaning up previous demo data', { projectId });

    // Delete in reverse dependency order
    await client.query(`DELETE FROM audit_log WHERE project_id = $1`, [projectId]);
    await client.query(`DELETE FROM voxel_alerts WHERE voxel_id IN (SELECT id FROM voxels WHERE project_id = $1)`, [projectId]);
    await client.query(`DELETE FROM voxel_status_history WHERE voxel_id IN (SELECT id FROM voxels WHERE project_id = $1)`, [projectId]);
    await client.query(`DELETE FROM pm_decisions WHERE project_id = $1`, [projectId]);
    await client.query(`DELETE FROM voxels WHERE project_id = $1`, [projectId]);
    await client.query(`DELETE FROM project_roles WHERE project_id = $1`, [projectId]);
    await client.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
  }

  /**
   * Persist user records
   */
  private async persistUsers(
    client: PoolClient,
    users: unknown[],
    warnings: string[]
  ): Promise<number> {
    let count = 0;

    for (const user of users) {
      const u = user as any;
      try {
        await client.query(`
          INSERT INTO users (
            id, email, full_name, role, auth_provider, is_active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            updated_at = NOW()
        `, [
          u.id,
          u.email,
          u.name,
          this.mapUserRole(u.role),
          'demo',
        ]);
        count++;
      } catch (err) {
        warnings.push(`Failed to insert user ${u.id}: ${err}`);
      }
    }

    return count;
  }

  /**
   * Map demo-scenarios role to Prisma StakeholderRole
   */
  private mapUserRole(role: string): string {
    const roleMap: Record<string, string> = {
      architect: 'ARCHITECT',
      engineer: 'ENGINEER',
      contractor: 'CONTRACTOR',
      owner: 'OWNER',
      admin: 'ADMIN',
      viewer: 'VIEWER',
    };
    return roleMap[role.toLowerCase()] || 'VIEWER';
  }

  /**
   * Persist project records
   */
  private async persistProjects(
    client: PoolClient,
    projects: unknown[],
    warnings: string[]
  ): Promise<number> {
    let count = 0;

    for (const project of projects) {
      const p = project as any;
      try {
        await client.query(`
          INSERT INTO projects (
            id, name, description, created_at, updated_at
          ) VALUES ($1, $2, $3, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            updated_at = NOW()
        `, [
          p.id,
          p.name,
          p.description,
        ]);
        count++;
      } catch (err) {
        warnings.push(`Failed to insert project ${p.id}: ${err}`);
      }
    }

    return count;
  }

  /**
   * Persist project participant/role records
   */
  private async persistParticipants(
    client: PoolClient,
    participants: unknown[],
    projectId: string,
    warnings: string[]
  ): Promise<number> {
    let count = 0;

    for (const participant of participants) {
      const p = participant as any;
      try {
        await client.query(`
          INSERT INTO project_roles (
            user_id, project_id, role, permissions, is_active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, true, NOW(), NOW())
          ON CONFLICT (user_id, project_id) DO UPDATE SET
            role = EXCLUDED.role,
            permissions = EXCLUDED.permissions,
            is_active = true,
            updated_at = NOW()
        `, [
          p.participant_id,
          projectId,
          this.mapUserRole(p.name?.includes('Architect') ? 'architect' :
                           p.name?.includes('Engineer') ? 'engineer' :
                           p.name?.includes('Contractor') ? 'contractor' : 'owner'),
          ['admin', 'read', 'write', 'delete', 'manage_members'],
        ]);
        count++;
      } catch (err) {
        warnings.push(`Failed to insert participant ${p.participant_id}: ${err}`);
      }
    }

    return count;
  }

  /**
   * Persist voxel records
   */
  private async persistVoxels(
    client: PoolClient,
    voxels: unknown[],
    projectId: string,
    warnings: string[]
  ): Promise<number> {
    let count = 0;

    for (const voxel of voxels) {
      const v = voxel as any;
      try {
        const status = VOXEL_STATUS_MAP[v.status] || 'PLANNED';
        const healthStatus = this.calculateHealthStatus(status);
        const percentComplete = this.calculatePercentComplete(status);

        await client.query(`
          INSERT INTO voxels (
            id, project_id, voxel_id, urn, status, health_status,
            coord_x, coord_y, coord_z, resolution,
            min_x, max_x, min_y, max_y, min_z, max_z,
            building, level, zone, system,
            current_phase, percent_complete, decision_count,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20,
            $21, $22, $23,
            NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            health_status = EXCLUDED.health_status,
            percent_complete = EXCLUDED.percent_complete,
            updated_at = NOW()
        `, [
          v.id,
          projectId,
          v.voxel_id,
          v.urn,
          status,
          healthStatus,
          v.coord_x,
          v.coord_y,
          v.coord_z,
          v.resolution,
          v.min_x,
          v.max_x,
          v.min_y,
          v.max_y,
          v.min_z,
          v.max_z,
          v.building,
          v.level,
          v.zone,
          v.system || 'STRUCT',
          this.getPhaseFromStatus(status),
          percentComplete,
          0, // decision_count will be updated after decisions are inserted
        ]);
        count++;
      } catch (err) {
        warnings.push(`Failed to insert voxel ${v.voxel_id}: ${err}`);
      }
    }

    return count;
  }

  /**
   * Calculate health status from voxel status
   */
  private calculateHealthStatus(status: string): string {
    if (status === 'BLOCKED') {
      return Math.random() > 0.5 ? 'CRITICAL' : 'AT_RISK';
    }
    if (status === 'ON_HOLD') {
      return 'AT_RISK';
    }
    return 'HEALTHY';
  }

  /**
   * Calculate percent complete from voxel status
   */
  private calculatePercentComplete(status: string): number | null {
    switch (status) {
      case 'COMPLETE':
        return 100;
      case 'IN_PROGRESS':
        return Math.floor(Math.random() * 70) + 10;
      case 'PLANNED':
        return 0;
      default:
        return null;
    }
  }

  /**
   * Get construction phase from status
   */
  private getPhaseFromStatus(status: string): string {
    switch (status) {
      case 'IN_PROGRESS':
        return 'Installation';
      case 'COMPLETE':
        return 'Complete';
      case 'BLOCKED':
        return 'Hold';
      default:
        return 'Planning';
    }
  }

  /**
   * Persist decision records
   */
  private async persistDecisions(
    client: PoolClient,
    decisions: unknown[],
    projectId: string,
    warnings: string[]
  ): Promise<number> {
    let count = 0;

    for (const decision of decisions) {
      const d = decision as any;
      try {
        const status = DECISION_STATUS_MAP[d.status] || 'PENDING';

        await client.query(`
          INSERT INTO pm_decisions (
            id, project_id, decision_id, urn, title, description,
            decision_type, status, priority, authority_required,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            updated_at = NOW()
        `, [
          d.id,
          projectId,
          d.decision_id,
          d.urn,
          d.title,
          d.description,
          d.type || 'APPROVAL',
          status,
          d.authority_required >= 3 ? 'HIGH' : 'MEDIUM',
          d.authority_required,
        ]);
        count++;
      } catch (err) {
        warnings.push(`Failed to insert decision ${d.decision_id}: ${err}`);
      }
    }

    // Update voxel decision counts
    await client.query(`
      UPDATE voxels SET decision_count = (
        SELECT COUNT(*) FROM pm_decisions WHERE pm_decisions.voxel_id = voxels.id
      ) WHERE project_id = $1
    `, [projectId]);

    return count;
  }

  /**
   * Persist alert records to voxel_alerts
   */
  private async persistAlerts(
    client: PoolClient,
    alerts: unknown[],
    projectId: string,
    warnings: string[]
  ): Promise<number> {
    let count = 0;

    for (const alert of alerts) {
      const a = alert as any;
      try {
        // Get a random voxel to attach the alert to
        const voxelResult = await client.query(
          `SELECT id FROM voxels WHERE project_id = $1 ORDER BY RANDOM() LIMIT 1`,
          [projectId]
        );

        if (voxelResult.rows.length === 0) continue;

        await client.query(`
          INSERT INTO voxel_alerts (
            voxel_id, title, message, priority, created_at
          ) VALUES ($1, $2, $3, $4, NOW())
        `, [
          voxelResult.rows[0].id,
          a.alert_type || 'Alert',
          a.message,
          a.severity?.toUpperCase() || 'MEDIUM',
        ]);
        count++;
      } catch (err) {
        warnings.push(`Failed to insert alert: ${err}`);
      }
    }

    return count;
  }

  /**
   * Create audit log entries for the demo seeding
   */
  private async createAuditEntries(
    client: PoolClient,
    projectId: string,
    counts: PersistenceResult['counts']
  ): Promise<number> {
    const activities = [
      { type: 'demo_initialized', message: `Demo project initialized with ${counts.voxels} voxels`, severity: 'info' },
      { type: 'decisions_seeded', message: `${counts.decisions} decisions created`, severity: 'info' },
      { type: 'users_seeded', message: `${counts.users} demo users created`, severity: 'info' },
    ];

    let count = 0;
    for (const activity of activities) {
      try {
        await client.query(`
          INSERT INTO audit_log (
            event_hash, event_type, resource_id, resource_type, actor_id, event_data
          ) VALUES (
            encode(digest(gen_random_uuid()::text || now()::text, 'sha256'), 'hex'),
            $1, $2, 'project', 'system', $3
          )
        `, [
          activity.type,
          projectId,
          JSON.stringify({ message: activity.message, severity: activity.severity, projectId }),
        ]);
        count++;
      } catch (err) {
        // Audit log failures are non-critical
      }
    }

    return count;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let serviceInstance: DemoPersistenceService | null = null;

/**
 * Get or create the demo persistence service singleton
 */
export function getDemoPersistenceService(pool: Pool): DemoPersistenceService {
  if (!serviceInstance) {
    serviceInstance = new DemoPersistenceService(pool);
  }
  return serviceInstance;
}
